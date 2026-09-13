import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContext, runInContext } from 'node:vm'
import { afterEach, describe, expect, it } from 'vitest'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** Real controller + filesystem; only the expensive generated TeX core is replaced. */
function boot(failure?: 'initex' | 'missing-output') {
  const root = mkdtempSync(join(tmpdir(), 'wasmtex-format-controller-'))
  roots.push(root)
  const local = (path: string) => join(root, path)
  const memory = new WebAssembly.Memory({ initial: 1 })
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const fmt = Uint8Array.of(3, 1, 4, 1, 5)
  let pointer = 32
  let builds = 0
  let deliver: (message: Record<string, unknown>) => void = () => {}
  const readString = (at: number) => {
    const bytes = new Uint8Array(memory.buffer)
    return decoder.decode(bytes.subarray(at, bytes.indexOf(0, at)))
  }
  const fs = {
    streams: [],
    mkdir: (path: string) => mkdirSync(local(path), { recursive: true }),
    mkdirTree: (path: string) => mkdirSync(local(path), { recursive: true }),
    chdir() {},
    readdir: (path: string) => ['.', '..', ...readdirSync(local(path))],
    stat: (path: string) => statSync(local(path)),
    isDir: (mode: number) => (mode & 0o170000) === 0o040000,
    unlink: (path: string) => unlinkSync(local(path)),
    rmdir: (path: string) => rmdirSync(local(path)),
    writeFile: (path: string, bytes: string | Uint8Array) => writeFileSync(local(path), bytes),
    readFile(path: string, options?: { encoding?: string }) {
      const bytes = readFileSync(local(path))
      return options?.encoding === 'utf8' ? bytes.toString() : Uint8Array.from(bytes)
    },
  }
  const scope = createContext({
    wasmMemory: memory,
    thisProgram: 'pdftex',
    FS: fs,
    performance: { now: () => 0 },
    console: { error() {}, log() {}, warn() {} },
    importScripts() {},
    postMessage: (message: Record<string, unknown>) => deliver(message),
    _malloc(size: number) {
      const start = pointer
      pointer += size
      return start
    },
    _free() {},
    lengthBytesUTF8: (value: string) => encoder.encode(value).length,
    stringToUTF8(value: string, at: number) {
      new Uint8Array(memory.buffer).set(encoder.encode(`${value}\0`), at)
    },
    UTF8ToString: readString,
    _compileBibtex: () => 0,
    _main(argc: number, argv: number) {
      const view = new DataView(memory.buffer)
      const args = Array.from({ length: argc }, (_, i) =>
        readString(view.getUint32(argv + i * 4, true)),
      )
      if (args.includes('-ini')) {
        builds++
        if (builds === 1 && failure === 'initex') return 2
        if (builds === 1 && failure === 'missing-output') return 0
        fs.writeFile('/work/pdflatex.fmt', fmt)
        return 0
      }
      try {
        fs.readFile('/work/main.tex')
      } catch {
        return 2
      }
      fs.writeFile('/work/main.pdf', Uint8Array.of(37, 80, 68, 70))
      return 0
    },
  })
  scope.self = scope
  runInContext(
    readFileSync(new URL('../../wasm-build/pdftex-worker.js', import.meta.url), 'utf8'),
    scope,
  )
  runInContext('Module.preRun(); Module.postRun()', scope)
  fs.mkdir('/work/nested')
  fs.writeFile('/work/main.tex', 'caller source')
  fs.writeFile('/work/nested/data.bin', Uint8Array.of(0, 255, 128))
  fs.writeFile('/work/language.dat', 'caller language data')
  fs.writeFile('/tex/preloaded.sty', 'warmup bytes')
  return {
    fs,
    fmt,
    builds: () => builds,
    compile: () =>
      new Promise<Record<string, unknown>>((resolve) => {
        deliver = resolve
        runInContext('self.onmessage({ data: { cmd: "compilelatex" } })', scope)
      }),
  }
}

describe('pdfTeX base format fallback', () => {
  it('returns the generated format once, retains it for repeat compiles, and preserves input bytes', async () => {
    const worker = boot()
    const first = await worker.compile()
    expect(first.result).toBe('ok')
    expect(new Uint8Array(first.format as ArrayBuffer)).toEqual(worker.fmt)
    const second = await worker.compile()
    expect(second.result).toBe('ok')
    expect(second.format).toBeUndefined()
    expect(worker.builds()).toBe(1)
    expect(worker.fs.readFile('/work/main.tex', { encoding: 'utf8' })).toBe('caller source')
    expect(worker.fs.readFile('/work/nested/data.bin')).toEqual(Uint8Array.of(0, 255, 128))
    expect(worker.fs.readFile('/work/language.dat', { encoding: 'utf8' })).toBe(
      'caller language data',
    )
    expect(worker.fs.readFile('/tex/preloaded.sty', { encoding: 'utf8' })).toBe('warmup bytes')
  })

  it('reports INITEX failure while keeping caller files available for retry', async () => {
    const worker = boot('initex')
    expect(await worker.compile()).toMatchObject({ result: 'failed', status: 2, cmd: 'compile' })
    expect(worker.fs.readFile('/work/main.tex', { encoding: 'utf8' })).toBe('caller source')
    expect(worker.fs.readFile('/work/nested/data.bin')).toEqual(Uint8Array.of(0, 255, 128))
    expect(await worker.compile()).toMatchObject({ result: 'ok' })
  })

  it('reports missing format output and permits a fresh build on retry', async () => {
    const worker = boot('missing-output')
    expect(await worker.compile()).toMatchObject({ result: 'failed', status: -253 })
    expect(worker.fs.readFile('/work/main.tex', { encoding: 'utf8' })).toBe('caller source')
    expect(await worker.compile()).toMatchObject({ result: 'ok' })
    expect(worker.builds()).toBe(2)
  })
})
