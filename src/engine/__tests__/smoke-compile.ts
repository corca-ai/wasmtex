import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Shared Node-host compile helper for the opt-in engine smokes (`*.smoke.test.ts`). Spins
 * up the real WASM engine off-browser against the live TeX Live CDN and returns the pieces
 * the smokes assert on. Kept in one place so the smokes don't each re-declare it (cpd).
 *
 * Not a vitest target (no `.test` suffix, no `describe`/`it`); only imported by the smokes.
 */
export const SMOKE_TEXLIVE = 'https://d1jectpaw0dlvl.cloudfront.net/2025/'

export interface SmokeCompileResult {
  success: boolean
  pdfBytes: number
  log: string
  errors: Array<{ message: string; severity: string }>
}

export async function smokeCompile(
  files: Record<string, string>,
  texliveUrl: string = SMOKE_TEXLIVE,
): Promise<SmokeCompileResult> {
  const { installNodeWorkerHost } = await import('../node-host')
  const { WasmTexCompiler } = await import('../../headless')
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
  const ASSET = 'http://assets.local/'
  installNodeWorkerHost({ publicDir: join(root, 'public'), assetBaseUrl: ASSET })
  const compiler = new WasmTexCompiler({
    engine: 'pdflatex',
    assetBaseUrl: ASSET,
    texliveUrl,
    files,
  })
  try {
    await compiler.init()
    const r = await compiler.compile()
    return {
      success: r.success,
      pdfBytes: r.pdf?.length ?? 0,
      log: r.log ?? '',
      errors: r.errors ?? [],
    }
  } finally {
    compiler.dispose()
  }
}
