import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const PAGE = 65536

/** Run the authored controller through boot and compile messages. The stand-in
 * engine returns the bytes it sees on entry, then dirties them for the next run. */
function boot(engine: 'xetex' | 'luatex' | 'dvipdfm', initial: Uint8Array, registerIcu = false) {
  const memory = new WebAssembly.Memory({ initial: initial.length / PAGE, maximum: 8 })
  new Uint8Array(memory.buffer).set(initial)
  const messages: Array<{ cmd?: string; pdf?: ArrayBuffer }> = []
  let output = new Uint8Array(0)
  let icuRegistrations = 0
  const compile = () => {
    output = new Uint8Array(memory.buffer).slice()
    new Uint8Array(memory.buffer).fill(0xa5)
    return 0
  }
  const scope = createContext({
    wasmMemory: memory,
    get HEAPU8() {
      return new Uint8Array(memory.buffer)
    },
    importScripts() {},
    postMessage(message: (typeof messages)[number]) {
      messages.push(message)
    },
    FS: {
      streams: [],
      mkdir() {},
      chdir() {},
      writeFile() {},
      unlink() {},
      readFile(path: string) {
        if (path.endsWith('.xdv') || path.endsWith('.pdf')) return output
        throw new Error('No auxiliary file in the stand-in engine')
      },
    },
    cwrap: () => () => 0,
    _compileLaTeX: compile,
    _compilePDF: compile,
    XMLHttpRequest: class {
      status = 404
      open() {}
      send() {}
    },
    _malloc: () => PAGE + 7,
    _set_icu_common_data() {
      icuRegistrations++
      // Registration itself also changes C state outside the data buffer.
      new Uint8Array(memory.buffer)[PAGE + 100] = 0x81
      return 0
    },
  })
  scope.self = scope
  runInContext(
    readFileSync(new URL(`../../wasm-build/${engine}-worker.js`, import.meta.url), 'utf8'),
    scope,
  )
  runInContext('Module.postRun()', scope)
  if (engine === 'xetex') {
    scope.icuRegistered = !registerIcu
    if (registerIcu) scope.icuData = new Uint8Array([13, 17, 23, 29, 31])
  }
  return {
    memory,
    icuRegistrations: () => icuRegistrations,
    compile() {
      const command = engine === 'dvipdfm' ? 'compilepdf' : 'compilelatex'
      runInContext(`self.onmessage({ data: { cmd: '${command}' } })`, scope)
      const response = messages.filter((message) => message.cmd === 'compile').pop()
      expect(response?.pdf).toBeDefined()
      return new Uint8Array(response!.pdf!)
    },
  }
}

describe.each(['xetex', 'luatex', 'dvipdfm'] as const)('%s heap restore', (engine) => {
  it.each([
    'empty',
    'sparse',
    'dense',
  ] as const)('restores every original byte on repeated compiles with a %s initial heap', (kind) => {
    const initial = new Uint8Array(2 * PAGE)
    if (kind === 'dense') initial.fill(0x93)
    if (kind === 'sparse') {
      initial[0] = 3
      initial[PAGE - 2] = 127 // non-word-aligned end of the retained prefix
    }
    const worker = boot(engine, initial)
    new Uint8Array(worker.memory.buffer).fill(0xff)
    expect(worker.compile()).toEqual(initial)
    expect(worker.compile()).toEqual(initial)
  })

  it('preserves the previous restore boundary after WASM memory grows', () => {
    const initial = new Uint8Array(PAGE)
    initial[23] = 19
    const worker = boot(engine, initial)
    worker.memory.grow(1)
    new Uint8Array(worker.memory.buffer).fill(0x37)
    const expected = new Uint8Array(2 * PAGE).fill(0x37)
    expected.set(initial)
    expect(worker.compile()).toEqual(expected)
    // The old full-snapshot restore also left the post-snapshot extent alone.
    expected.fill(0xa5, PAGE)
    expect(worker.compile()).toEqual(expected)
  })
})

it('retains ICU data and registration when XeTeX replaces its initial snapshot', () => {
  const initial = new Uint8Array(2 * PAGE)
  initial[41] = 37
  const worker = boot('xetex', initial, true)
  const expected = initial.slice()
  expected.set([13, 17, 23, 29, 31], PAGE + 7)
  expected[PAGE + 100] = 0x81
  expect(worker.compile()).toEqual(expected)
  expect(worker.compile()).toEqual(expected)
  expect(worker.icuRegistrations()).toBe(1)
})
