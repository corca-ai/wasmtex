import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { smokeTexliveProfile } from './smoke-texlive-profile'

// Explicit engine assets keep this test independent of any integrating application.
// WASMTEX_UNICODE_WARMUP_SMOKE=1 WASMTEX_SMOKE_PUBLIC_DIR=... npx vitest run ...
const RUN = process.env.WASMTEX_UNICODE_WARMUP_SMOKE === '1'
const PROFILE = smokeTexliveProfile()

describe.runIf(RUN)('Unicode runtime preparation preserves file lookup semantics', () => {
  it.each([
    'xelatex',
    'lualatex',
  ] as const)('%s does not invent extensionless files', async (engine) => {
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
    const canonical = engine === 'xelatex' ? 'lmroman10-bold.otf' : 'fontspec.lua'
    const source = String.raw`\documentclass{article}
\begin{document}
\IfFileExists{${probe}}{\typeout{ALIAS-PRESENT}PRESENT}{\typeout{ALIAS-ABSENT}ABSENT}
\IfFileExists{${canonical}}{\typeout{CANONICAL-PRESENT}}{\typeout{CANONICAL-ABSENT}}
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
      for (let repeat = 0; repeat < 2; repeat++) {
        const result = await compiler.compile()
        expect(result.success, result.log).toBe(true)
        expect(result.pdf?.length).toBeGreaterThan(0)
        expect(result.log).toContain('ALIAS-ABSENT')
        expect(result.log).not.toContain('ALIAS-PRESENT')
        expect(result.log).toContain('CANONICAL-PRESENT')
        expect(result.log).not.toContain('CANONICAL-ABSENT')
      }
      expect(runs.mock.calls.some(([command]) => command === 'compileformat')).toBe(false)
    } finally {
      compiler.dispose()
      host.dispose()
      runs.mockRestore()
    }
  }, 180_000)
})
