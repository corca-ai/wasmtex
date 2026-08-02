import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Node compile smoke (#121): proves the same WASM pdfTeX engine runs off-browser via the
 * `worker_threads` host adapter and produces a PDF. Opt-in (needs network to the TeX Live
 * CDN + `curl` + the built engine assets in `public/`), so it is skipped in CI:
 *
 *   NODE_COMPILE_SMOKE=1 npx vitest run src/engine/node-compile.smoke.test.ts
 *
 * Set `WASMTEX_SMOKE_PUBLIC_DIR` to exercise locally rebuilt assets without replacing the
 * checked-in release artifacts under `public/`.
 */
const RUN = process.env.NODE_COMPILE_SMOKE === '1'

describe.runIf(RUN)('node compile smoke (#121)', () => {
  it('compiles a trivial pdfLaTeX document to a PDF under Node', async () => {
    const { installNodeWorkerHost } = await import('./node-host')
    const { WasmTexCompiler } = await import('../headless')

    const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
    const ASSET = 'http://assets.local/'
    installNodeWorkerHost({
      publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(root, 'public'),
      assetBaseUrl: ASSET,
    })

    const doc = [
      '\\documentclass{article}',
      '\\usepackage{xcolor}',
      '\\usepackage{xkeyval}',
      '\\newcommand{\\runtimecommand}[1]{#1}',
      '\\newenvironment{runtimeenvironment}{}{}',
      '\\newcounter{runtimecounter}',
      '\\definecolor{runtimecolor}{HTML}{123456}',
      '\\makeatletter',
      '\\define@key{runtimefamily}{runtimekey}{}',
      '\\makeatother',
      '\\begin{document}',
      'Hello from Node + WASM. $E=mc^2$.',
      '\\end{document}',
      '',
    ].join('\n')
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
      const snapshot = result.telemetry?.completionSnapshot
      if (snapshot) {
        console.log(
          '[node-smoke] completion fields',
          Object.fromEntries(
            Object.entries(snapshot.fields).map(([name, field]) => [
              name,
              {
                status: field.status,
                complete: field.complete,
                values: field.values.length,
                dropped: field.dropped ?? 0,
              },
            ]),
          ),
        )
      }
      expect(snapshot).toMatchObject({
        version: 1,
        identity: { engine: 'pdflatex', root: 'main.tex' },
        fields: {
          commands: { status: 'observed', complete: true },
          environments: { status: 'observed', complete: true },
          colors: { status: 'observed', complete: true },
          counters: { status: 'observed', complete: true },
          keyFamilies: { status: 'observed', complete: true },
        },
      })
      expect(snapshot?.fields.commands.values.map((command) => command.name)).toContain(
        'runtimecommand',
      )
      expect(snapshot?.fields.environments.values.map((value) => value.name)).toContain(
        'runtimeenvironment',
      )
      expect(snapshot?.fields.counters.values.map((value) => value.name)).toContain(
        'runtimecounter',
      )
      expect(snapshot?.fields.colors.values.map((value) => value.name)).toContain('runtimecolor')
      expect(
        snapshot?.fields.keyFamilies.values
          .find((family) => family.name === 'runtimefamily')
          ?.keys.map((key) => key.name),
      ).toContain('runtimekey')
    } finally {
      compiler.dispose()
    }
  }, 120_000)
})
