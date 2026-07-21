import { describe, expect, it } from 'vitest'
import { buildDependencyGraph } from './dependency-graph'

const edge = (g: ReturnType<typeof buildDependencyGraph>, from: string, to: string) =>
  g.edges.find((e) => e.from === from && e.to === to)
const node = (g: ReturnType<typeof buildDependencyGraph>, id: string) =>
  g.nodes.find((n) => n.id === id)

describe('buildDependencyGraph (#54 slice 4)', () => {
  it('builds a parent→child graph from the log file opens', () => {
    const log = [
      '(./main.tex',
      '(/usr/share/texlive/tex/latex/base/article.cls',
      'Document Class: article',
      ')',
      '(/usr/share/texlive/tex/latex/amsmath/amsmath.sty)',
      '(./chapters/intro.tex)',
      ')',
    ].join('\n')
    const g = buildDependencyGraph(log)
    expect(g.root).toBe('main.tex')
    // classification
    expect(node(g, 'main.tex')).toMatchObject({ kind: 'tex', origin: 'project' })
    expect(node(g, 'article.cls')).toMatchObject({ kind: 'class', origin: 'system' })
    expect(node(g, 'amsmath.sty')).toMatchObject({ kind: 'package', origin: 'system' })
    expect(node(g, 'chapters/intro.tex')).toMatchObject({ kind: 'tex', origin: 'project' })
    // relations + nesting
    expect(edge(g, 'main.tex', 'article.cls')?.relation).toBe('loads')
    expect(edge(g, 'main.tex', 'amsmath.sty')?.relation).toBe('loads')
    expect(edge(g, 'main.tex', 'chapters/intro.tex')?.relation).toBe('includes')
    expect(node(g, 'main.tex')?.discoveredBy).toEqual(['log'])
  })

  it('dedupes a dep seen via multiple signals and merges discoveredBy', () => {
    const log = '(./main.tex(/usr/share/texlive/amsmath.sty))'
    const source = '\\documentclass{article}\n\\usepackage{amsmath,graphicx}\n\\input{intro}'
    const g = buildDependencyGraph(log, { source })
    // amsmath.sty appears in both log and source → one node, both signals
    const amsmath = node(g, 'amsmath.sty')
    expect(amsmath).toBeDefined()
    expect(amsmath?.discoveredBy.sort()).toEqual(['log', 'source'])
    expect(g.nodes.filter((n) => n.id === 'amsmath.sty')).toHaveLength(1)
    // source-only deps normalized to file ids that match the log convention
    expect(node(g, 'article.cls')).toMatchObject({ kind: 'class' })
    expect(node(g, 'graphicx.sty')).toMatchObject({ kind: 'package', discoveredBy: ['source'] })
    expect(edge(g, 'main.tex', 'intro.tex')?.relation).toBe('includes')
  })

  it('adds .fls inputs as reads from the root', () => {
    const log = '(./main.tex)'
    const g = buildDependencyGraph(log, {
      inputFiles: ['./main.tex', '/usr/share/texlive/amsmath.sty', './data.csv', './figure.pdf'],
    })
    expect(node(g, 'amsmath.sty')?.discoveredBy).toContain('fls')
    expect(edge(g, 'main.tex', 'amsmath.sty')?.relation).toBe('reads')
    // main.tex came from the log first, then the fls signal merges in
    expect(node(g, 'main.tex')?.discoveredBy.sort()).toEqual(['fls', 'log'])
    // a non-tex input is still recorded (kind 'other')
    expect(node(g, 'data.csv')).toMatchObject({ kind: 'other' })
    // a PDF \includegraphics target is an image, not 'other'
    expect(node(g, 'figure.pdf')).toMatchObject({ kind: 'image' })
  })

  it('adds fonts used (XDV) as uses-font edges', () => {
    const log = '(./main.tex)'
    const g = buildDependencyGraph(log, {
      fonts: ['lmroman10-regular.otf', 'lmroman10-regular.otf'],
    })
    expect(node(g, 'lmroman10-regular.otf')).toMatchObject({ kind: 'font', origin: 'system' })
    expect(edge(g, 'main.tex', 'lmroman10-regular.otf')?.relation).toBe('uses-font')
    // deduped despite the repeated font
    expect(g.nodes.filter((n) => n.kind === 'font')).toHaveLength(1)
  })

  it('returns an empty graph for a clean/empty log', () => {
    const g = buildDependencyGraph('This is XeTeX.\nNo file opens here.\n')
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
    expect(g.root).toBeUndefined()
  })

  it('never self-loops when source declares the root', () => {
    // root falls back to main.tex; \input{main} must not create main.tex→main.tex
    const g = buildDependencyGraph('', { source: '\\input{main}' })
    expect(g.edges.every((e) => e.from !== e.to)).toBe(true)
  })

  it('always materializes the root as a node so source edges are not dangling', () => {
    // No log and no \input naming the root: the fallback root main.tex is only
    // referenced by source edges, so it must still be inserted as a node.
    const g = buildDependencyGraph('', {
      source: '\\documentclass{article}\n\\usepackage{amsmath}\n\\input{intro}',
    })
    expect(g.root).toBe('main.tex')
    expect(g.nodes.some((n) => n.id === g.root)).toBe(true)
    // every edge endpoint resolves to a real node (no dangling root edges)
    expect(g.edges.every((e) => g.nodes.some((n) => n.id === e.from))).toBe(true)
  })

  it('keeps files with a /./ path segment distinct (does not collapse to basename)', () => {
    const log = ['(/work/chapters/./intro.tex)', '(/work/appendix/./intro.tex)'].join('\n')
    const g = buildDependencyGraph(log)
    expect(node(g, 'chapters/intro.tex')).toMatchObject({ kind: 'tex', origin: 'project' })
    expect(node(g, 'appendix/intro.tex')).toMatchObject({ kind: 'tex', origin: 'project' })
    // not merged into a single basename node
    expect(g.nodes.filter((n) => n.id === 'intro.tex')).toHaveLength(0)
  })

  it('filters internal engine scratch files (__strace.tex) without corrupting nesting', () => {
    // The semantic-trace hook opens __strace.tex inside main.tex; it must not appear,
    // and the file opened after it must still nest under main.tex (stack stays balanced).
    const log = ['(./main.tex', '(__strace.tex)', '(./real.tex)', ')'].join('\n')
    const g = buildDependencyGraph(log)
    expect(g.nodes.find((n) => n.id.startsWith('__'))).toBeUndefined()
    expect(edge(g, 'main.tex', 'real.tex')?.relation).toBe('includes')
  })
})
