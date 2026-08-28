import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Shared Node-host compile helper for the opt-in engine smokes (`*.smoke.test.ts`). Spins
 * up the real WASM engine off-browser against the live TeX Live CDN and returns the pieces
 * the smokes assert on. Kept in one place so the smokes don't each re-declare it (cpd).
 *
 * Not a vitest target (no `.test` suffix, no `describe`/`it`); only imported by the smokes.
 */
export const SMOKE_TEXLIVE =
  process.env.WASMTEX_SMOKE_TEXLIVE_URL ??
  'https://texlive.corca.ai/snapshots/2025-92e10d3241a312f0/2025/'

/** A pdfLaTeX document of `n` `\clearpage`-separated sections, each with a replaceable plain-text
 *  marker; the last section's marker is `lastMarker`. Editing only the last marker is a servable
 *  final tail edit — the shared corpus for the incremental / SyncTeX-splice smokes. */
export function buildSectionedDoc(lastMarker: string, n = 6): string {
  const filler = 'The quick brown fox jumps over the lazy dog across measurable pages. '.repeat(3)
  const sections = Array.from({ length: n }, (_, i) => {
    const s = i + 1
    const marker = s === n ? lastMarker : `S${s}`
    return `\\section{Section ${s}}\n${filler}\n\nMarker-${s}: ${marker} sits in plain text.\n\n${filler}\n`
  })
  return (
    '\\documentclass{article}\n\\begin{document}\n' +
    sections.map((sec, i) => sec + (i < sections.length - 1 ? '\n\\clearpage\n' : '')).join('\n') +
    '\n\\end{document}\n'
  )
}

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
