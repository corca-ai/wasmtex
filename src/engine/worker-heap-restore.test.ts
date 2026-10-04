import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const PAGE = 65536

/** Run the authored controller through boot and compile messages. The stand-in
 * engine returns the bytes it sees on entry, then dirties them for the next run. */
function boot(
  engine: 'pdftex' | 'xetex' | 'luatex' | 'dvipdfm',
  initial: Uint8Array,
  registerIcu = false,
  icuRegistrationFailures = 0,
) {
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
    performance,
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
        if (path.endsWith('.xdv') || path.endsWith('.pdf') || path.endsWith('.fmt')) return output
        throw new Error('No auxiliary file in the stand-in engine')
      },
    },
    cwrap: () => () => 0,
    _compileLaTeX: compile,
    _compileFormat: compile,
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
      return icuRegistrations <= icuRegistrationFailures ? 1 : 0
    },
  })
  scope.self = scope
  if (engine !== 'pdftex') {
    runInContext(
      readFileSync(new URL('../../wasm-build/heap-snapshot.js', import.meta.url), 'utf8'),
      scope,
    )
  }
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
    retainedIcuBytes: () => (scope.icuData as Uint8Array | null)?.byteLength ?? 0,
    retainedBytes() {
      if (engine === 'pdftex') return (scope.initmem as Uint8Array).byteLength
      const snapshot = scope.initmem as { bytes: Uint8Array; ranges: Uint32Array }
      return snapshot.bytes.byteLength + snapshot.ranges.byteLength
    },
    compile() {
      const command =
        engine === 'pdftex' ? 'compileformat' : engine === 'dvipdfm' ? 'compilepdf' : 'compilelatex'
      runInContext(`self.onmessage({ data: { cmd: '${command}' } })`, scope)
      const response = messages.filter((message) => message.cmd === 'compile').pop()
      expect(response?.pdf).toBeDefined()
      return new Uint8Array(response!.pdf!)
    },
  }
}

describe.each(['pdftex', 'xetex', 'luatex', 'dvipdfm'] as const)('%s heap restore', (engine) => {
  it.each([
    'empty',
    'sparse',
    'dense',
    'negative-zero',
    'nan',
  ] as const)('restores every original byte on repeated compiles with a %s initial heap', (kind) => {
    const initial = new Uint8Array(2 * PAGE)
    if (kind === 'dense') initial.fill(0x93)
    if (kind === 'sparse') {
      initial[0] = 3
      initial[PAGE - 2] = 127 // non-word-aligned end of the retained prefix
    }
    if (kind === 'negative-zero') new DataView(initial.buffer).setFloat64(PAGE - 8, -0, true)
    if (kind === 'nan') {
      const words = new DataView(initial.buffer)
      words.setUint32(PAGE - 8, 0x12345678, true) // retain the original NaN payload bytes
      words.setUint32(PAGE - 4, 0x7ff80000, true)
    }
    const worker = boot(engine, initial)
    new Uint8Array(worker.memory.buffer).fill(0xff)
    expect(worker.compile()).toEqual(initial)
    expect(worker.compile()).toEqual(initial)
  })

  it('preserves the engine-specific restore boundary after WASM memory grows', () => {
    const initial = new Uint8Array(PAGE)
    initial[23] = 19
    const worker = boot(engine, initial)
    worker.memory.grow(1)
    new Uint8Array(worker.memory.buffer).fill(0x37)
    const expected = new Uint8Array(2 * PAGE).fill(engine === 'pdftex' ? 0 : 0x37)
    expected.set(initial)
    expect(worker.compile()).toEqual(expected)
    // pdfTeX clears grown pages; Unicode controllers leave that extent alone.
    if (engine !== 'pdftex') expected.fill(0xa5, PAGE)
    expect(worker.compile()).toEqual(expected)
  })
})

describe.each(['xetex', 'luatex', 'dvipdfm'] as const)('%s sparse snapshot storage', (engine) => {
  it('omits internal zero gaps and restores separated regions on repeated compiles', () => {
    const initial = new Uint8Array(6 * PAGE)
    initial[7] = 13
    initial[2 * PAGE - 1] = 17
    initial[2 * PAGE] = 19 // neighboring occupied pages, with an interior zero suffix
    initial[5 * PAGE + 9] = 23
    const worker = boot(engine, initial)
    expect(worker.retainedBytes()).toBeLessThan(2 * PAGE)
    new Uint8Array(worker.memory.buffer).fill(0xff)
    expect(worker.compile()).toEqual(initial)
    expect(worker.compile()).toEqual(initial)
  })

  it('stores no payload or range metadata for an entirely zero heap', () => {
    const initial = new Uint8Array(4 * PAGE)
    const worker = boot(engine, initial)
    expect(worker.retainedBytes()).toBe(0)
    expect(worker.compile()).toEqual(initial)
  })
})

it('pdfTeX retains only initialized bytes, independently of unused initial capacity', () => {
  const initial = new Uint8Array(4 * PAGE)
  initial[PAGE - 2] = 127
  const worker = boot('pdftex', initial)
  expect(worker.retainedBytes()).toBe(PAGE)
  expect(worker.compile()).toEqual(initial)
  expect(worker.compile()).toEqual(initial)
})

it.each([
  false,
  true,
])('retains registered ICU state and releases fetched bytes (growth=%s)', (grow) => {
  const initial = new Uint8Array((grow ? 1 : 2) * PAGE)
  initial[41] = 37
  const worker = boot('xetex', initial, true)
  if (grow) {
    worker.memory.grow(1)
    new Uint8Array(worker.memory.buffer).fill(0x42, PAGE)
  }
  const expected = new Uint8Array(2 * PAGE).fill(grow ? 0x42 : 0)
  expected.set(initial)
  expected.set([13, 17, 23, 29, 31], PAGE + 7)
  expected[PAGE + 100] = 0x81
  expect(worker.compile()).toEqual(expected)
  expect(worker.compile()).toEqual(expected)
  expect(worker.icuRegistrations()).toBe(1)
  expect(worker.retainedIcuBytes()).toBe(0)
})

it('retains fetched ICU bytes on registration failure and releases them after a successful retry', () => {
  const worker = boot('xetex', new Uint8Array(2 * PAGE), true, 1)
  const expected = new Uint8Array(2 * PAGE)
  expected.set([13, 17, 23, 29, 31], PAGE + 7)
  expected[PAGE + 100] = 0x81
  expect(worker.compile()).toEqual(expected)
  expect(worker.retainedIcuBytes()).toBe(5)
  expect(worker.compile()).toEqual(expected)
  expect(worker.retainedIcuBytes()).toBe(0)
  expect(worker.compile()).toEqual(expected)
  expect(worker.icuRegistrations()).toBe(2)
})
