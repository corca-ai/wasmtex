import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { installNodeWorkerHost } from '../engine/node-host'
import { WasmTexCompiler } from '../headless'
import {
  createLatexLanguageService,
  diagnosticCompileBinaryInputs,
  HttpTexResourceCatalogProvider,
} from '../lsp-service'

const mirrorRevision = '2025-92e10d3241a312f0'
const baseUrl = `https://texlive.corca.ai/snapshots/${mirrorRevision}/2025/`
const profile = { id: 'tl2025-r20260802', texliveYear: '2025' as const, mirrorRevision }

describe.runIf(process.env.DIAGNOSTIC_REPAIR_SMOKE === '1')('real-engine package repair', () => {
  it('repairs an included dfrac command by adding amsmath to the root and recompiles cleanly', async () => {
    const host = installNodeWorkerHost({
      publicDir: process.env.WASMTEX_SMOKE_PUBLIC_DIR ?? join(import.meta.dirname, '../../public'),
      assetBaseUrl: 'http://assets.local/',
    })
    const files = {
      'main.tex': '\\documentclass{article}\n\\begin{document}\n\\input{child}\n\\end{document}\n',
      'child.tex': '$\\dfrac{1}{2}$\n',
    }
    const compiler = new WasmTexCompiler({
      engine: 'pdflatex',
      texliveVersion: '2025',
      assetBaseUrl: 'http://assets.local/',
      texliveUrl: baseUrl,
      completionProfile: profile,
      files: { ...files, 'data.bin': Uint8Array.of(1, 2, 3) },
    })
    try {
      await compiler.init()
      const before = await compiler.compile()
      expect(before.log).toContain('! Undefined control sequence.')
      const snapshot = before.telemetry?.completionSnapshot
      if (!snapshot) throw new Error('Engine did not provide compile identity')
      const service = createLatexLanguageService({
        files,
        completionProfile: profile,
        completionEngine: 'pdflatex',
        resourceCatalog: new HttpTexResourceCatalogProvider({
          baseUrl,
          identity: { schemaVersion: 1, texliveYear: '2025', mirrorRevision },
        }),
      })
      expect(
        await service.updateDiagnosticCompileContext({
          snapshot,
          log: before.log,
          binaryInputs: await diagnosticCompileBinaryInputs({
            ...files,
            'data.bin': Uint8Array.of(1, 2, 3),
          }),
        }),
        before.log,
      ).toEqual({
        ok: true,
        undefinedCommands: 1,
      })
      const result = await service.getDiagnosticRepairs('child.tex', 2)
      if (!result.ok) throw new Error(result.reason)
      const proposal = result.proposals.find((value) => value.kind === 'missing-package')
      if (!proposal) throw new Error('Expected a package proposal')
      expect(proposal.package).toBe('amsmath')
      const plan = await service.planDiagnosticRepair(proposal)
      if (!plan.ok) throw new Error(plan.reason)
      expect(plan.edits).toHaveLength(1)
      const edit = plan.edits[0]!
      expect(edit.file).toBe('main.tex')
      expect(files['main.tex'].slice(edit.range.startOffset, edit.range.endOffset)).toBe(
        edit.expectedText,
      )
      const updated =
        files['main.tex'].slice(0, edit.range.startOffset) +
        edit.newText +
        files['main.tex'].slice(edit.range.endOffset)
      compiler.setFile('main.tex', updated)
      service.updateFile('main.tex', updated)
      expect(await service.planDiagnosticRepair(proposal)).toEqual({ ok: false, reason: 'stale' })
      const after = await compiler.compile()
      expect(after.success).toBe(true)
      expect(after.pdf?.length).toBeGreaterThan(0)
      expect(after.errors.filter((error) => error.severity === 'error')).toEqual([])
      expect(after.log).not.toContain('! Undefined control sequence.')
    } finally {
      compiler.dispose()
      host.dispose()
    }
  }, 120_000)
})
