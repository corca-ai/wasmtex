import { describe, expect, it } from 'vitest'
import { createCompletionSnapshot } from '../../engine/completion-snapshot'
import { createLatexLanguageService } from '../../lsp-service'

const profile = { id: 'test', texliveYear: '2025' as const, mirrorRevision: 'rev-1' }
const files = {
  'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{child}\n\\end{document}\n',
  'child.tex': 'Before \\includegraphics{plot.pdf}\n',
}
// Direct error context observed from a real pdfTeX compile of the files above.
// That run returned a PDF and success=true; its command inventory was truncated.
const log =
  '(./main.tex\nDocument Class: article 2024/06/29 v1.4n Standard LaTeX document class\n(/tex/size10.clo)) (/tex/l3backend-pdftex.def) (./main.aux) (./child.tex\n! Undefined control sequence.\nl.1 Before \\includegraphics\n                           {plot.pdf}\n) [1{/tex/pdftex.map}] (./main.aux) )'

async function context() {
  return {
    log,
    snapshot: await createCompletionSnapshot({
      engine: 'pdflatex',
      root: 'main.tex',
      profile,
      projectFiles: Object.entries(files).map(([path, content]) => ({ path, content })),
      inputFiles: ['main.tex', 'child.tex', '/tex/article.cls'],
      inputFilesComplete: true,
    }),
  }
}

function service() {
  return createLatexLanguageService({
    files,
    completionProfile: profile,
    completionEngine: 'pdflatex',
  })
}

describe('revision-bound diagnostic compile context', () => {
  it('accepts direct runtime evidence without claiming complete command inventory', async () => {
    const input = await context()
    expect(input.snapshot.fields.commands.complete).toBe(false)
    expect(await service().updateDiagnosticCompileContext(input)).toEqual({
      ok: true,
      undefinedCommands: 1,
    })
  })

  it('requires explicit engine and immutable profile identity', async () => {
    const input = await context()
    expect(
      await createLatexLanguageService({ files }).updateDiagnosticCompileContext(input),
    ).toEqual({ ok: false, reason: 'unsupported' })
    for (const field of ['engine', 'root', 'profile'] as const) {
      const changed = structuredClone(input)
      if (field === 'engine') changed.snapshot.identity.engine = 'xelatex'
      if (field === 'root') changed.snapshot.identity.root = 'child.tex'
      if (field === 'profile') changed.snapshot.identity.profile.mirrorRevision = 'different'
      expect(await service().updateDiagnosticCompileContext(changed)).toEqual({
        ok: false,
        reason: 'stale',
      })
    }
  })

  it('rejects source or binary asset changes even when the error line is unchanged', async () => {
    const input = await context()
    const language = service()
    language.updateFile('main.tex', `${files['main.tex']}% changed`)
    expect(await language.updateDiagnosticCompileContext(input)).toEqual({
      ok: false,
      reason: 'stale',
    })
    language.loadProject(files)
    language.updateFile('image.bin', Uint8Array.of(1))
    expect(await language.updateDiagnosticCompileContext(input)).toEqual({
      ok: false,
      reason: 'stale',
    })
  })

  it('rejects an in-flight context after an edit-and-revert or profile change', async () => {
    const input = await context()
    const language = service()
    const first = language.updateDiagnosticCompileContext(input)
    language.updateFile('child.tex', 'changed')
    language.updateFile('child.tex', files['child.tex'])
    expect(await first).toEqual({ ok: false, reason: 'stale' })
    const second = language.updateDiagnosticCompileContext(input)
    language.configureCompletion({ completionProfile: profile, completionEngine: 'pdflatex' })
    expect(await second).toEqual({ ok: false, reason: 'stale' })
  })

  it('cancels or replaces in-flight evidence without publishing the old context', async () => {
    const input = await context()
    const language = service()
    const cancellation = { isCancellationRequested: false }
    const cancelled = language.updateDiagnosticCompileContext(input, cancellation)
    cancellation.isCancellationRequested = true
    expect(await cancelled).toEqual({ ok: false, reason: 'cancelled' })
    const old = language.updateDiagnosticCompileContext(input)
    const newest = language.updateDiagnosticCompileContext({ ...input, log: '' })
    expect(await old).toEqual({ ok: false, reason: 'stale' })
    expect(await newest).toEqual({ ok: true, undefinedCommands: 0 })
    const cleared = language.updateDiagnosticCompileContext(input)
    language.clearDiagnosticCompileContext()
    expect(await cleared).toEqual({ ok: false, reason: 'stale' })
  })
})
