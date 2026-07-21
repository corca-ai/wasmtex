import type * as monaco from 'monaco-editor'
import { describe, expect, it, vi } from 'vitest'
import { ProjectIndex } from '../project-index'
import { createRenameProvider, type WorkspaceEditInfo } from '../rename-provider'
import { type MockModel, mockModel } from './test-helpers'

interface RenameEditResult {
  edits: Array<{
    textEdit: {
      text: string
    }
  }>
}

interface RenameLocationResult {
  text: string
  range: {
    startLineNumber: number
  }
}

describe('createRenameProvider', () => {
  function rename(
    provider: ReturnType<typeof createRenameProvider>,
    model: MockModel,
    line: number,
    col: number,
    newName: string,
  ): RenameEditResult | undefined {
    return provider.provideRenameEdits(
      model as unknown as monaco.editor.ITextModel,
      { lineNumber: line, column: col } as unknown as monaco.Position,
      newName,
      undefined as unknown as monaco.CancellationToken,
    ) as unknown as RenameEditResult | undefined
  }

  function resolve(
    provider: ReturnType<typeof createRenameProvider>,
    model: MockModel,
    line: number,
    col: number,
  ): RenameLocationResult {
    return provider.resolveRenameLocation?.(
      model as unknown as monaco.editor.ITextModel,
      { lineNumber: line, column: col } as unknown as monaco.Position,
      undefined as unknown as monaco.CancellationToken,
    ) as unknown as RenameLocationResult
  }

  describe('provideRenameEdits', () => {
    it('renames a label and its refs across files', () => {
      const index = new ProjectIndex()
      const provider = createRenameProvider(index)

      index.updateFile('main.tex', '\\ref{fig:a}\n\\ref{fig:a}')
      index.updateFile('chapter.tex', '\\label{fig:a}')

      const model = mockModel(['\\ref{fig:a}', '\\ref{fig:a}'])
      const result = rename(provider, model, 1, 7, 'fig:b')

      expect(result).toBeDefined()
      expect(result!.edits.length).toBe(3)
      for (const edit of result!.edits) {
        expect(edit.textEdit.text).toBe('fig:b')
      }
    })

    it('returns undefined when no symbol at position', () => {
      const index = new ProjectIndex()
      const provider = createRenameProvider(index)

      index.updateFile('main.tex', 'Hello world')

      const model = mockModel(['Hello world'])
      const result = rename(provider, model, 1, 3, 'foo')

      expect(result).toBeUndefined()
    })

    it('renames citations across tex and bib files', () => {
      const index = new ProjectIndex()
      const provider = createRenameProvider(index)

      index.updateFile('main.tex', '\\cite{knuth84}')
      index.updateBib([
        { key: 'knuth84', type: 'article', location: { file: 'refs.bib', line: 1, column: 1 } },
      ])

      const model = mockModel(['\\cite{knuth84}'])
      const result = rename(provider, model, 1, 8, 'knuth99')

      expect(result).toBeDefined()
      expect(result!.edits.length).toBe(2)
    })

    it('renames a single label def', () => {
      const index = new ProjectIndex()
      const provider = createRenameProvider(index)

      index.updateFile('main.tex', '\\label{sec:intro}')

      const model = mockModel(['\\label{sec:intro}'])
      const result = rename(provider, model, 1, 9, 'sec:overview')

      expect(result).toBeDefined()
      expect(result!.edits.length).toBe(1)
      expect(result!.edits[0]!.textEdit.text).toBe('sec:overview')
    })

    it('renames a user command across its definition and all call sites', () => {
      // Regression: renaming a command used to edit only the definition, leaving the call
      // sites pointing at a now-undefined command — a silently broken document.
      const index = new ProjectIndex()
      const provider = createRenameProvider(index)

      index.updateFile('main.tex', '\\newcommand{\\foo}{x}\n\\foo here \\foo')
      index.updateFile('ch.tex', '\\foo again')

      const model = mockModel(['\\newcommand{\\foo}{x}', '\\foo here \\foo'])
      // Rename starting from a call site (line 2, the first \foo's "f").
      const result = rename(provider, model, 2, 2, 'bar')

      expect(result).toBeDefined()
      // definition token + 2 uses in main + 1 use in ch
      expect(result!.edits.length).toBe(4)
      expect(result!.edits.every((e) => e.textEdit.text === 'bar')).toBe(true)
    })
  })

  describe('resolveRenameLocation', () => {
    it('returns the symbol range and text', () => {
      const index = new ProjectIndex()
      const provider = createRenameProvider(index)

      index.updateFile('main.tex', '\\label{myLabel}')

      const model = mockModel(['\\label{myLabel}'])
      const result = resolve(provider, model, 1, 9)

      expect(result).toBeDefined()
      expect(result.text).toBe('myLabel')
      expect(result.range.startLineNumber).toBe(1)
    })

    it('rejects when no symbol at position', async () => {
      const index = new ProjectIndex()
      const provider = createRenameProvider(index)

      index.updateFile('main.tex', 'plain text')

      const model = mockModel(['plain text'])

      await expect(resolve(provider, model, 1, 3) as unknown as Promise<unknown>).rejects.toBe(
        'You cannot rename this element.',
      )
    })
  })

  describe('onWorkspaceEdit callback', () => {
    it('calls callback with edit info when edits are produced', () => {
      const callback = vi.fn<(info: WorkspaceEditInfo) => void>()
      const index = new ProjectIndex()
      const provider = createRenameProvider(index, callback)

      index.updateFile('main.tex', '\\label{x}')
      index.updateFile('other.tex', '\\ref{x}')

      const model = mockModel(['\\label{x}'])
      rename(provider, model, 1, 8, 'y')

      expect(callback).toHaveBeenCalledOnce()
      const info = callback.mock.calls[0]![0]
      expect(info.edits.length).toBe(2)
      expect(info.edits[0]!.newText).toBe('y')
    })

    it('does not call callback when no symbol found', () => {
      const callback = vi.fn<(info: WorkspaceEditInfo) => void>()
      const index = new ProjectIndex()
      const provider = createRenameProvider(index, callback)

      index.updateFile('main.tex', 'no symbols here')

      const model = mockModel(['no symbols here'])
      rename(provider, model, 1, 5, 'foo')

      expect(callback).not.toHaveBeenCalled()
    })
  })
})
