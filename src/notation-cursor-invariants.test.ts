import { describe, expect, it } from 'vitest'
import { findLatexNotationPath, LatexSyntaxService } from './syntax'

const DIRECT_SURFACES = [
  {
    content: '$\\hat y$',
    expected: { kind: 'modifier', name: 'hat' },
    id: 'unbraced modifier',
  },
  {
    content: '$\\mathbf{\\hat{y}}$',
    expected: { kind: 'style', name: 'mathbf' },
    id: 'nested style',
  },
  {
    content: '$\\operatorname{ECE}(x)$',
    expected: { kind: 'named-operator', name: 'ECE' },
    id: 'named surface',
  },
  {
    content: '$B_m$',
    expected: { kind: 'script', name: 'subscript' },
    id: 'subscript',
  },
] as const

describe('neutral notation cursor invariants', () => {
  it.each(DIRECT_SURFACES)('keeps every source code unit inside the $id owner', ({
    content,
    expected,
  }) => {
    const syntax = new LatexSyntaxService().upsert({
      content,
      documentVersion: 1,
      fileId: 'main',
      path: 'main.tex',
    })
    const nodeId = syntax.nodes.findIndex(
      (node) => node.kind === expected.kind && node.name === expected.name,
    )
    expect(nodeId).toBeGreaterThanOrEqual(0)
    const node = syntax.nodes[nodeId]!

    for (
      let offset = node.ranges.full.startOffset;
      offset < node.ranges.full.endOffset;
      offset += 1
    ) {
      expect(findLatexNotationPath(syntax, offset), `offset ${offset}`).toContain(nodeId)
    }
  })

  it('keeps every ECE character in one named surface', () => {
    const content = '$\\operatorname{ECE}(x)$'
    const syntax = new LatexSyntaxService().upsert({
      content,
      documentVersion: 1,
      fileId: 'main',
      path: 'main.tex',
    })
    const nodeId = syntax.nodes.findIndex(
      (node) => node.kind === 'named-operator' && node.name === 'ECE',
    )
    const start = content.indexOf('ECE')
    expect(nodeId).toBeGreaterThanOrEqual(0)
    for (let offset = start; offset < start + 3; offset += 1) {
      expect(findLatexNotationPath(syntax, offset)).toContain(nodeId)
    }
  })

  it('relinks a project macro without changing its real call-site owner', () => {
    const service = new LatexSyntaxService()
    service.reset({
      documents: [
        {
          content: '$\\prediction{y}$',
          documentVersion: 1,
          fileId: 'main',
          path: 'main.tex',
        },
        {
          content: '\\newcommand{\\prediction}[1]{\\hat{#1}}',
          documentVersion: 1,
          fileId: 'macros',
          path: 'macros.tex',
        },
      ],
    })
    const before = service.getFile('main')!
    const expanded = before.nodes.findIndex(
      (node) =>
        node.kind === 'modifier' && node.name === 'hat' && node.provenance?.origin === 'expansion',
    )
    expect(expanded).toBeGreaterThanOrEqual(0)
    const call = before.macros.find(
      (macro) => macro.kind === 'call' && macro.name === 'prediction',
    )!
    const input = call.expansion.inputRange!
    for (let offset = input.startOffset; offset < input.endOffset; offset += 1) {
      expect(findLatexNotationPath(before, offset)).toContain(expanded)
    }

    service.remove('macros')
    const after = service.getFile('main')!
    expect(after.macros.find((macro) => macro.name === 'prediction')?.expansion.status).toBe(
      'unresolved',
    )
    expect(service.getInvalidatedFiles().map((syntax) => syntax.fileId)).toEqual(['main'])
  })
})
