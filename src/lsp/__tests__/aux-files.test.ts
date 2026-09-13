import { describe, expect, it } from 'vitest'
import { createLatexLanguageService } from '../../lsp-service'
import { parseAuxFiles, readAuxFiles } from '../aux-files'

describe('compiler aux file sets', () => {
  it('preserves ambiguity within one aux even when a later included file repeats the key', () => {
    const source = '\\newlabel{x}{{1}{2}}\n\\newlabel{x}{{3}{4}}'
    const service = createLatexLanguageService({ files: { 'main.tex': '\\ref{x} \\pageref{x}' } })
    service.updateAux(source)
    expect(service.getInlayHints('main.tex')).toEqual([])
    const files = {
      root: 'main.aux',
      files: {
        'main.aux': `${source}\n\\@input{child.aux}`,
        'child.aux': '\\newlabel{x}{{5}{6}}',
      },
    }
    expect(parseAuxFiles(files).ambiguousLabels).toEqual(new Set(['x']))
    service.updateAuxFiles(files)
    expect(service.getInlayHints('main.tex')).toEqual([])
  })
  it('resolves nested roots and recursive inputs against the compiler working directory', async () => {
    const outputs: Record<string, string> = {
      'docs/main.aux': '\\@input{chapters/a.aux}',
      'chapters/a.aux': '\\newlabel{a}{{2}{7}}\n\\@input{chapters/b.aux}',
      'chapters/b.aux': '\\newlabel{b}{{3}{9}}\n\\@input{docs/main.aux}',
    }
    const reads: string[] = []
    const files = await readAuxFiles('docs/main.aux', async (path) => {
      reads.push(path)
      return outputs[path] ?? null
    })
    expect(reads).toEqual(Object.keys(outputs))
    const parsed = parseAuxFiles(files)
    expect(parsed.complete).toBe(true)
    expect(parsed.labelDetails?.get('b')).toEqual({ number: '3', page: '9' })
    const service = createLatexLanguageService({ files: { 'main.tex': '\\pageref{a}' } })
    service.updateAuxFiles(files)
    expect(service.getInlayHints('main.tex')[0]?.label).toBe(' (7)')
  })

  it('does not read outside output paths and suppresses incomplete reference evidence', async () => {
    const reads: string[] = []
    const files = await readAuxFiles('main.aux', async (path) => {
      reads.push(path)
      return path === 'main.aux'
        ? '\\newlabel{a}{{2}{7}}\n\\@input{../private.aux}\n\\@input{/private.aux}\n\\@input{missing.aux}'
        : null
    })
    expect(reads).toEqual(['main.aux', 'missing.aux'])
    expect(parseAuxFiles(files).complete).toBe(false)
    const service = createLatexLanguageService({ files: { 'main.tex': '\\ref{a}' } })
    service.updateAuxFiles(files)
    expect(service.getInlayHints('main.tex')).toEqual([])
  })

  it('does not choose a value for labels repeated across outputs', () => {
    const parsed = parseAuxFiles({
      root: 'main.aux',
      files: {
        'main.aux': '\\newlabel{x}{{1}{2}}\n\\@input{child.aux}',
        'child.aux': '\\newlabel{x}{{3}{4}}\n\\newlabel{y}{{5}{6}}',
      },
    })
    expect(parsed.labels.has('x')).toBe(false)
    expect(parsed.labelDetails?.has('x')).toBe(false)
    expect(parsed.labels.get('y')).toBe('5')
  })
})
