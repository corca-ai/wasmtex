import { describe, expect, it, vi } from 'vitest'
import { createCompletionSnapshot } from '../../engine/completion-snapshot'
import * as parser from '../latex-parser'
import { ProjectIndex } from '../project-index'

describe('project input reobservation', () => {
  it('parses only changed source while retaining scoped symbols and references', () => {
    const parse = vi.spyOn(parser, 'parseLatexFile')
    try {
      const index = new ProjectIndex()
      const root = '\\input{part}\n\\ref{part}'
      const part = '\\label{part}'
      index.updateFile('main.tex', root)
      index.updateFile('part.tex', part)
      const labels = index.getAllLabels('main.tex')
      const active = index.getActiveFiles('main.tex')
      index.updateFile('main.tex', root)
      index.updateFile('part.tex', part)
      expect(index.getAllLabels('main.tex')).toEqual(labels)
      expect(index.getActiveFiles('main.tex')).toEqual(active)
      expect(index.findAllOccurrences('part', 'label')).toHaveLength(2)
      expect(parse).toHaveBeenCalledTimes(2)
      index.updateFile('part.tex', '\\label{changed}')
      expect(index.findLabelDef('part')).toBeUndefined()
      expect(index.findLabelDef('changed')?.location.file).toBe('part.tex')
      expect(parse).toHaveBeenCalledTimes(3)
    } finally {
      parse.mockRestore()
    }
  })

  it('retracts changed include edges and forgets a removed file before it is re-added', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\input{old}')
    index.updateFile('old.tex', '\\label{old}')
    index.updateFile('new.tex', '\\label{new}')
    expect(index.getAllLabels('main.tex').map((label) => label.name)).toEqual(['old'])
    const source = '\\input{new}'
    index.updateFile('main.tex', source)
    expect(index.getAllLabels('main.tex').map((label) => label.name)).toEqual(['new'])
    index.removeFile('main.tex')
    index.updateFile('main.tex', source)
    expect(index.getActiveFiles('main.tex')).toEqual(['main.tex', 'new.tex'])
    for (const path of index.getFiles()) index.removeFile(path)
    expect(index.getStats()).toEqual(new ProjectIndex().getStats())
  })

  it('replaces caller-supplied syntax symbols when source is subsequently observed again', () => {
    const index = new ProjectIndex()
    const source = '\\label{source}'
    index.updateFile('main.tex', source)
    index.updateFileSymbols('main.tex', parser.parseLatexFile('\\label{snapshot}', 'main.tex'))
    expect(index.findLabelDef('snapshot')).toBeDefined()
    index.updateFile('main.tex', source)
    expect(index.findLabelDef('snapshot')).toBeUndefined()
    expect(index.findLabelDef('source')).toBeDefined()
  })

  it('still retires runtime completion evidence on an identical source write', async () => {
    const index = new ProjectIndex()
    const content = '\\label{source}'
    index.updateFile('main.tex', content)
    index.updateCompletionSnapshot(
      await createCompletionSnapshot({
        engine: 'pdflatex',
        root: 'main.tex',
        profile: { id: 'test', texliveYear: '2026', mirrorRevision: null },
        projectFiles: [{ path: 'main.tex', content }],
        engineCommands: ['observed'],
        engineCommandsComplete: true,
      }),
    )
    expect(index.getCompletionSnapshotStatus()).toBe('fresh')
    index.updateFile('main.tex', content)
    expect(index.getCompletionSnapshotStatus()).toBe('stale')
    expect(index.getEngineCommands().size).toBe(0)
    expect(index.findLabelDef('source')).toBeDefined()
  })
})
