/**
 * Browser-side driver for the compatibility harness.
 *
 * Loaded by `scripts/compat/run.mjs` via Playwright. It exposes `window.__compat`
 * so the Node runner can compile each corpus case with the real headless engine
 * against the live TeX Live CDN, then classify the raw log. Kept out of `src/`
 * (and any library entry point) so it never ships in the published bundle.
 */
import { WasmTexCompiler } from '../src/headless'

interface CompilePayload {
  /** UTF-8 text files (path → content). */
  text: Record<string, string>
  /** Binary files (path → base64). */
  bin?: Record<string, string>
  mainFile: string
}

interface CompileOutcome {
  success: boolean
  hasPdf: boolean
  log: string
  compileTime: number
  pdfBytes: number
}

declare global {
  interface Window {
    __compat: {
      compile: (payload: CompilePayload) => Promise<CompileOutcome>
      reset: () => Promise<void>
    }
  }
}

let compiler: WasmTexCompiler | null = null

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function getCompiler(): Promise<WasmTexCompiler> {
  if (compiler) return compiler
  // Real CDN fetches, in-worker cache warmed across cases (faster, fewer fetches).
  // The runner periodically calls reset() to bound worker memory growth.
  const c = new WasmTexCompiler({ files: {}, mainFile: 'main.tex' })
  await c.init()
  compiler = c
  return c
}

async function reset(): Promise<void> {
  compiler?.dispose()
  compiler = null
}

async function compile(payload: CompilePayload): Promise<CompileOutcome> {
  const files: Record<string, string | Uint8Array> = { ...payload.text }
  for (const [path, b64] of Object.entries(payload.bin ?? {})) {
    files[path] = base64ToBytes(b64)
  }

  const c = await getCompiler()
  await c.loadProject(files)
  c.setMainFile(payload.mainFile)
  const result = await c.compile()
  const pdfBytes = result.pdf ? result.pdf.length : 0
  return {
    success: result.success,
    hasPdf: pdfBytes > 0,
    log: result.log ?? '',
    compileTime: Math.round(result.compileTime),
    pdfBytes,
  }
}

window.__compat = { compile, reset }
