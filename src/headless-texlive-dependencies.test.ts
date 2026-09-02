import { describe, expect, it } from 'vitest'
import { WasmTexCompiler } from './headless'
import type { CompileResult, ResolverEvidenceReport } from './types'

const profile = { id: 'production-2025', texliveYear: '2025' as const, mirrorRevision: 'r1' }

function report(entries: ResolverEvidenceReport['entries']): ResolverEvidenceReport {
  return { schemaVersion: 1, profile, entries, dropped: 0, complete: true }
}

/** First pass fetches from the mirror and asks for a rerun; the rerun only sees cache hits. */
class TwoPassEngine {
  compileCount = 0
  async compile(): Promise<CompileResult> {
    this.compileCount++
    const first = this.compileCount === 1
    return {
      success: true,
      pdf: new Uint8Array([1]),
      log: first
        ? 'LaTeX Warning: Label(s) may have changed. Rerun to get cross-references right.'
        : '',
      errors: [],
      compileTime: 1,
      synctex: null,
      telemetry: {
        diagnostics: [],
        resolver: report(
          first
            ? [
                {
                  stage: 'pdftex',
                  requestedName: 'ptmr7t.vf',
                  format: 33,
                  outcome: 'resolved',
                  attempts: [
                    {
                      source: 'network',
                      outcome: 'not-found',
                      candidate: 'ptmr7t.vf',
                      status: 404,
                    },
                    { source: 'network', outcome: 'hit', candidate: 'ptmr7t', status: 200 },
                  ],
                },
                {
                  stage: 'pdftex',
                  requestedName: 'ptmb7t.vf',
                  format: 33,
                  outcome: 'mirror-absent',
                  attempts: [{ source: 'network', outcome: 'not-found', status: 404 }],
                },
              ]
            : [
                {
                  stage: 'pdftex',
                  requestedName: 'ptmr7t.vf',
                  format: 33,
                  outcome: 'resolved',
                  attempts: [{ source: 'session-cache', outcome: 'hit' }],
                },
                {
                  stage: 'pdftex',
                  requestedName: 'nameref.sty',
                  format: 26,
                  outcome: 'resolved',
                  attempts: [
                    { source: 'network', outcome: 'hit', candidate: 'nameref.sty', status: 200 },
                  ],
                },
              ],
        ),
      },
    }
  }
  async readFile(): Promise<string | null> {
    return null
  }
  async writeFile(): Promise<void> {}
  async mkdir(): Promise<void> {}
  setMainFile(): void {}
  terminate(): void {}
}

describe('headless texliveDependencies telemetry', () => {
  it('unions resolver evidence across rerun passes into one prefetch manifest', async () => {
    const compiler = new WasmTexCompiler({
      engine: 'pdflatex',
      files: { 'main.tex': '\\documentclass{article}\\begin{document}x\\end{document}' },
      completionProfile: profile,
    })
    const engine = new TwoPassEngine()
    ;(compiler as unknown as { engine: TwoPassEngine }).engine = engine
    ;(compiler as unknown as { initialized: boolean }).initialized = true

    const result = await compiler.compile()
    expect(engine.compileCount).toBe(2)
    expect(result.telemetry?.texliveDependencies).toEqual({
      schemaVersion: 1,
      texliveVersion: '2025',
      profile,
      files: [
        { format: 33, filename: 'ptmr7t.vf', candidate: 'ptmr7t' },
        { format: 26, filename: 'nameref.sty' },
      ],
      notFound: [{ format: 33, filename: 'ptmb7t.vf' }],
      complete: true,
    })
    compiler.dispose()
  })
})
