import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Node compile smoke (#121): proves the same WASM pdfTeX engine runs off-browser via the
 * `worker_threads` host adapter and produces a PDF. Opt-in (needs network to the TeX Live
 * CDN + `curl` + the built engine assets in `public/`), so it is skipped in CI:
 *
 *   NODE_COMPILE_SMOKE=1 npx vitest run src/engine/node-compile.smoke.test.ts
 */
const RUN = process.env.NODE_COMPILE_SMOKE === '1'

describe.runIf(RUN)('node compile smoke (#121)', () => {
  it('compiles a trivial pdfLaTeX document to a PDF under Node', async () => {
    const { installNodeWorkerHost } = await import('./node-host')
    const { WasmTexCompiler } = await import('../headless')

    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const ASSET = 'http://assets.local/'
    installNodeWorkerHost({ publicDir: join(root, 'public'), assetBaseUrl: ASSET })

    const doc =
      '\\documentclass{article}\n\\begin{document}\nHello from Node + WASM. $E=mc^2$.\n\\end{document}\n'
    const compiler = new WasmTexCompiler({
      engine: 'pdflatex',
      assetBaseUrl: ASSET,
      texliveUrl: 'https://d1jectpaw0dlvl.cloudfront.net/2025/',
      files: { 'main.tex': doc },
    })
    try {
      await compiler.init()
      const result = await compiler.compile()
      console.log(
        `[node-smoke] success=${result.success} pdfBytes=${result.pdf?.length ?? 0} errors=${result.errors?.length ?? 0}`,
      )
      expect(result.success).toBe(true)
      expect(result.pdf?.length ?? 0).toBeGreaterThan(0)
    } finally {
      compiler.dispose()
    }
  }, 50_000)
})
