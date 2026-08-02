import { describe, expect, it, vi } from 'vitest'
import { VirtualFS } from '../../fs/virtual-fs'
import { LatexLanguageService } from '../../lsp-service'
import {
  analyzeCompletionContext,
  type CommandArgumentCompletionContext,
} from '../completion-context'
import { CompletionResolverRegistry } from '../completion-registry'
import { ProjectIndex } from '../project-index'
import type { NeutralDocument, NeutralPosition } from '../protocol'

function marked(source: string): {
  document: NeutralDocument
  position: NeutralPosition
  text: string
} {
  const offset = source.indexOf('¦')
  if (offset < 0) throw new Error('fixture must contain a ¦ cursor marker')
  const text = source.slice(0, offset) + source.slice(offset + 1)
  const before = source.slice(0, offset)
  const lines = text.split('\n')
  const beforeLines = before.split('\n')
  return {
    text,
    document: {
      path: 'main.tex',
      getText: () => text,
      lineAt: (line) => lines[line - 1] ?? '',
    },
    position: {
      line: beforeLines.length,
      column: beforeLines[beforeLines.length - 1]!.length + 1,
    },
  }
}

function argument(source: string): CommandArgumentCompletionContext {
  const fixture = marked(source)
  const context = analyzeCompletionContext(fixture.document, fixture.position)
  expect(context?.type).toBe('argument')
  return context as CommandArgumentCompletionContext
}

describe('analyzeCompletionContext', () => {
  it('resolves a class selector that appears after a multiline option cursor', () => {
    const context = argument('\\documentclass[\n  twocolumn,\n  dra¦ft\n]{book}')

    expect(context).toMatchObject({
      command: 'documentclass',
      argumentIndex: 0,
      signatureIndex: 0,
      delimiter: 'optional',
      valueKind: 'key-value',
      keyValuePosition: 'key',
      keyFamily: 'class-options',
      list: true,
      listIndex: 1,
      prefix: 'dra',
      selector: { signatureIndex: 1, valueKind: 'tex-class', values: ['book'] },
    })
    expect(context.replacementRange).toEqual({
      startLine: 3,
      startColumn: 3,
      endLine: 3,
      endColumn: 8,
    })
  })

  it('finds top-level key/value and comma segments through nested groups', () => {
    const context = argument('\\usepackage[foo={a,b}, bar=tr¦ue]{pkg-a,pkg-b}')

    expect(context).toMatchObject({
      command: 'usepackage',
      valueKind: 'key-value',
      listIndex: 1,
      keyValuePosition: 'value',
      key: 'bar',
      prefix: 'tr',
      usedKeys: ['foo'],
      selector: {
        signatureIndex: 1,
        valueKind: 'tex-package',
        values: ['pkg-a', 'pkg-b'],
      },
    })
    expect(context.replacementRange).toEqual({
      startLine: 1,
      startColumn: 28,
      endLine: 1,
      endColumn: 32,
    })
  })

  it('replaces the whole current list item, including a suffix after the cursor', () => {
    const context = argument('\\cref{fig:a, fi¦g:b, fig:c}')

    expect(context).toMatchObject({
      valueKind: 'label',
      listIndex: 1,
      prefix: 'fi',
    })
    expect(context.replacementRange).toEqual({
      startLine: 1,
      startColumn: 14,
      endLine: 1,
      endColumn: 19,
    })
  })

  it('uses registered signatures for starred commands and shields outer arguments', () => {
    const registry = new CompletionResolverRegistry()
    registry.registerCommand('pick', [
      { kind: 'optional', valueKind: 'enum', list: true },
      { kind: 'required', valueKind: 'label' },
    ])
    const fixture = marked('\\ref{\\pick*[one,two]{fi¦g:a}}')
    const context = analyzeCompletionContext(fixture.document, fixture.position, registry)

    expect(context).toMatchObject({
      type: 'argument',
      command: 'pick',
      starred: true,
      argumentIndex: 1,
      signatureIndex: 1,
      valueKind: 'label',
      prefix: 'fi',
    })
  })

  it('returns null in comments, inline verb, and verbatim environments', () => {
    for (const source of [
      '% See \\ref{fi¦g:a}',
      '\\verb|See \\ref{fi¦g:a}|',
      '\\begin{verbatim}\n\\ref{fi¦g:a}\n\\end{verbatim}',
    ]) {
      const fixture = marked(source)
      expect(analyzeCompletionContext(fixture.document, fixture.position)).toBeNull()
    }
  })

  it('never throws on unfinished nested input', () => {
    const fixture = marked('\\usepackage[foo={a,b}, bar=¦')
    expect(() => analyzeCompletionContext(fixture.document, fixture.position)).not.toThrow()
    expect(analyzeCompletionContext(fixture.document, fixture.position)).toMatchObject({
      type: 'argument',
      valueKind: 'key-value',
      keyValuePosition: 'value',
      key: 'bar',
      usedKeys: ['foo'],
    })
  })

  it('returns an exact command-name range that includes a suffix', () => {
    const fixture = marked('\\docu¦mntclass')
    expect(analyzeCompletionContext(fixture.document, fixture.position)).toEqual({
      type: 'command',
      domain: 'command',
      documentPath: 'main.tex',
      prefix: 'docu',
      replacementRange: {
        startLine: 1,
        startColumn: 2,
        endLine: 1,
        endColumn: 14,
      },
    })
  })
})

describe('CompletionResolverRegistry', () => {
  it('dispatches a custom typed domain through LatexLanguageService', () => {
    const registry = new CompletionResolverRegistry()
    registry.registerCommand('pick', [{ kind: 'required', valueKind: 'enum' }])
    registry.registerResolver('enum', (context) => [
      {
        label: 'draft',
        kind: 'keyword',
        insertText: 'draft',
        replaceLength: context.prefix.length,
      },
    ])
    const service = new LatexLanguageService({
      files: { 'main.tex': '\\pick{dr}' },
      completionRegistry: registry,
    })

    expect(service.getCompletions('main.tex', 1, 9)).toMatchObject([
      {
        label: 'draft',
        replacementRange: {
          startLine: 1,
          startColumn: 7,
          endLine: 1,
          endColumn: 9,
        },
      },
    ])
  })

  it('does not invoke a resolver after cancellation', () => {
    const registry = new CompletionResolverRegistry()
    registry.registerCommand('pick', [{ kind: 'required', valueKind: 'enum' }])
    const resolver = vi.fn(() => [])
    registry.registerResolver('enum', resolver)
    const fixture = marked('\\pick{dr¦}')

    expect(
      registry.resolve(analyzeCompletionContext(fixture.document, fixture.position, registry)!, {
        document: fixture.document,
        position: fixture.position,
        index: new ProjectIndex(),
        fs: new VirtualFS({ empty: true }),
        cancellationToken: { isCancellationRequested: true },
      }),
    ).toEqual([])
    expect(resolver).not.toHaveBeenCalled()
  })
})
