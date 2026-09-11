import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { smokeTexliveProfile } from './smoke-texlive-profile'

// Explicit engine assets keep this test independent of any integrating application.
// WASMTEX_UNICODE_WARMUP_SMOKE=1 WASMTEX_SMOKE_PUBLIC_DIR=... npx vitest run ...
const RUN = process.env.WASMTEX_UNICODE_WARMUP_SMOKE === '1'
const PROFILE = smokeTexliveProfile()

describe.runIf(RUN)('Unicode file lookup preserves demand-created aliases', () => {
  it.each([
    'xelatex',
    'lualatex',
  ] as const)('%s creates aliases only after the corresponding runtime lookup', async (engine) => {
    const { installNodeWorkerHost } = await import('./node-host')
    const { WasmTexCompiler } = await import('../headless')
    const { CompileWorkerDriver } = await import('./wasmtex-worker')
    const runs = vi.spyOn(CompileWorkerDriver.prototype, 'run')
    const assetBaseUrl = 'http://assets.local/'
    const host = installNodeWorkerHost({
      publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? resolve('public'),
      assetBaseUrl,
    })
    const probe = engine === 'xelatex' ? 'lmroman10-bold' : 'fontspec'
    const source = String.raw`\documentclass{article}
\begin{document}
\IfFileExists{${probe}}{\typeout{ALIAS-PRESENT}PRESENT}{\typeout{ALIAS-ABSENT}ABSENT}
\end{document}`
    const compiler = new WasmTexCompiler({
      engine,
      assetBaseUrl,
      texliveVersion: PROFILE.version,
      texliveUrl: PROFILE.url,
      files: { 'main.tex': source },
      mainFile: 'main.tex',
    })
    try {
      await compiler.init()
      for (const loaded of [false, true, true]) {
        compiler.setFile(
          'main.tex',
          loaded
            ? source.replace(
                '\\begin{document}',
                '\\usepackage{fontspec}\\setmainfont{Latin Modern Roman}\n\\begin{document}',
              )
            : source,
        )
        const result = await compiler.compile()
        expect(result.success, result.log).toBe(true)
        expect(result.pdf?.length).toBeGreaterThan(0)
        expect(result.log).toContain(loaded ? 'ALIAS-PRESENT' : 'ALIAS-ABSENT')
        expect(result.log).not.toContain(loaded ? 'ALIAS-ABSENT' : 'ALIAS-PRESENT')
      }
      expect(runs.mock.calls.some(([command]) => command === 'compileformat')).toBe(false)
    } finally {
      compiler.dispose()
      host.dispose()
      runs.mockRestore()
    }
  }, 180_000)
})
