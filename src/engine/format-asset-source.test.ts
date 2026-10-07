import { afterEach, describe, expect, it, vi } from 'vitest'
import { WasmTexCompiler } from '../headless'
import { BibtexEngine } from './bibtex-engine'
import { WasmTexLuatexEngine } from './luatex-engine'
import { WasmTexPdftexEngine } from './wasmtex-engine'
import { type EngineWorker, setWorkerFactory } from './worker-host'
import { WasmTexXetexEngine } from './xetex-engine'

let disposeHost: (() => void) | undefined
afterEach(() => {
  disposeHost?.()
  vi.unstubAllGlobals()
})

function installHost() {
  const workers: string[] = []
  const fetches: string[] = []
  disposeHost = setWorkerFactory((url) => {
    workers.push(url)
    let handler: EngineWorker['onmessage'] = null
    return {
      get onmessage() {
        return handler
      },
      set onmessage(value) {
        handler = value
        if (value) queueMicrotask(() => value({ data: { result: 'ok' } }))
      },
      onerror: null,
      terminate() {},
      postMessage(message) {
        const request = message as { cmd?: string; msgId?: number }
        queueMicrotask(() => handler?.({ data: { ...request, result: 'ok', data: null } }))
      },
    }
  })
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = input.toString()
    fetches.push(url)
    return url.endsWith('.fmt')
      ? new Response(new Uint8Array(65537).fill(65))
      : new Response(null, { status: 404 })
  })
  return { workers, fetches }
}

const opts = {
  assetBaseUrl: 'https://engine.test/new/',
  formatAssetBaseUrl: 'https://formats.test/old',
  texliveVersion: '2026',
} as const

describe('independent format asset source', () => {
  it.each([
    ['pdftex', WasmTexPdftexEngine],
    ['xetex', WasmTexXetexEngine],
    ['luatex', WasmTexLuatexEngine],
  ] as const)('fetches %s formats independently of its worker', async (binary, Engine) => {
    const { workers, fetches } = installHost()
    const engine = new Engine(opts)
    await engine.init()
    const formatRequests = fetches.filter((url) => url.includes('wasmtex-'))
    expect(formatRequests).toEqual([
      ...(binary === 'pdftex'
        ? []
        : [`https://formats.test/old/wasmtex/2026/wasmtex-${binary}.fmt.gz`]),
      `https://formats.test/old/wasmtex/2026/wasmtex-${binary}.fmt`,
    ])
    expect(workers).toContain(`https://engine.test/new/wasmtex/2026/wasmtex-${binary}.worker.js`)
    expect(workers.every((url) => url.startsWith(opts.assetBaseUrl))).toBe(true)
    if (binary === 'xetex')
      expect(workers).toContain('https://engine.test/new/wasmtex/2026/wasmtex-dvipdfm.worker.js')
    engine.terminate()
  })

  it('keeps bibliography workers at the engine base', async () => {
    const { workers } = installHost()
    const engine = new BibtexEngine(opts)
    await engine.init()
    expect(workers).toEqual(['https://engine.test/new/wasmtex/2026/wasmtex-bibtex.worker.js'])
    engine.terminate()
  })

  it('forwards the format source through the headless compiler', async () => {
    const { fetches } = installHost()
    const compiler = new WasmTexCompiler({
      ...opts,
      engine: 'lualatex',
      files: { 'main.tex': '\\documentclass{article}\\begin{document}Hi\\end{document}' },
    })
    await compiler.init()
    expect(fetches).toContain('https://formats.test/old/wasmtex/2026/wasmtex-luatex.fmt')
    compiler.dispose()
  })

  it.each([
    'spawnFigureCompiler',
    'spawnExportCompiler',
  ] as const)('forwards the format source to %s siblings', async (method) => {
    const { fetches } = installHost()
    const root = new WasmTexCompiler({ ...opts })
    const sibling = (root as unknown as Record<typeof method, () => WasmTexCompiler>)[method]()
    await sibling.init()
    expect(fetches).toContain('https://formats.test/old/wasmtex/2026/wasmtex-pdftex.fmt')
    sibling.dispose()
    root.dispose()
  })

  it('keeps the existing source when no override is supplied', async () => {
    const { fetches } = installHost()
    const engine = new WasmTexPdftexEngine({ assetBaseUrl: opts.assetBaseUrl })
    await engine.init()
    expect(fetches).toContain('https://engine.test/new/wasmtex/2025/wasmtex-pdftex.fmt')
    engine.terminate()
  })
})
