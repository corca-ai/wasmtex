import { describe, expect, it } from 'vitest'
import { ProjectIndex } from '../project-index'
import type { SemanticTrace } from '../trace-parser'

describe('ProjectIndex', () => {
  it('indexes a file and retrieves labels', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{sec:intro}\n\\label{eq:1}')
    expect(index.getAllLabels()).toHaveLength(2)
    expect(index.getAllLabels().map((l) => l.name)).toEqual(['sec:intro', 'eq:1'])
  })

  it('retrieves file symbols', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\section{Hello}\n\\label{sec:hello}')
    const symbols = index.getFileSymbols('main.tex')
    expect(symbols).toBeDefined()
    expect(symbols!.sections).toHaveLength(1)
    expect(symbols!.labels).toHaveLength(1)
  })

  it('returns undefined for unknown file', () => {
    const index = new ProjectIndex()
    expect(index.getFileSymbols('nope.tex')).toBeUndefined()
  })

  it('removes a file', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{a}')
    index.removeFile('a.tex')
    expect(index.getAllLabels()).toHaveLength(0)
    expect(index.getFileSymbols('a.tex')).toBeUndefined()
  })

  it('updates a file (re-parse)', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{old}')
    expect(index.getAllLabels()[0]!.name).toBe('old')

    index.updateFile('main.tex', '\\label{new}')
    expect(index.getAllLabels()).toHaveLength(1)
    expect(index.getAllLabels()[0]!.name).toBe('new')
  })

  it('aggregates labels across files', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{a}')
    index.updateFile('b.tex', '\\label{b}')
    expect(index.getAllLabels()).toHaveLength(2)
  })

  it('scopes packages, class options, and colors to the active include graph', () => {
    const index = new ProjectIndex()
    index.updateFile(
      'main.tex',
      '\\documentclass[dvipsnames]{book}\n\\usepackage[svgnames]{xcolor}\n\\definecolor{root}{rgb}{1,0,0}\n\\input{chapters/a}',
    )
    index.updateFile('chapters/a.tex', '\\providecolor{chapter}{rgb}{0,1,0}\n\\input{../shared}')
    index.updateFile('shared.tex', '\\colorlet{alias}{root}')
    index.updateFile('unrelated.tex', '\\definecolor{hidden}{rgb}{0,0,1}')

    expect(index.getActiveFiles('chapters/a.tex')).toEqual([
      'main.tex',
      'chapters/a.tex',
      'shared.tex',
    ])
    expect(index.getLoadedClasses('chapters/a.tex')).toEqual(new Set(['book']))
    expect(index.getClassOptions('chapters/a.tex')).toEqual(new Set(['dvipsnames']))
    expect(index.getPackageOptions('xcolor', 'chapters/a.tex')).toEqual(new Set(['svgnames']))
    expect(index.getActiveColors('chapters/a.tex').map((color) => color.name)).toEqual([
      'root',
      'chapter',
      'alias',
    ])
  })

  it('updates active colors after edits and deletion without leaking another root', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\input{colors}\n\\input{chapter}')
    index.updateFile('colors.tex', '\\definecolor{old}{rgb}{1,0,0}')
    index.updateFile('chapter.tex', '')
    index.updateFile('other.tex', '\\definecolor{other}{rgb}{0,0,0}')
    expect(index.getActiveColors('chapter.tex').map((color) => color.name)).toEqual(['old'])
    index.updateFile('colors.tex', '\\definecolor{new}{rgb}{0,1,0}')
    expect(index.getActiveColors('chapter.tex').map((color) => color.name)).toEqual(['new'])
    index.removeFile('colors.tex')
    expect(index.getActiveColors('chapter.tex')).toEqual([])
  })

  it('orders project color precedence around includes like TeX execution', () => {
    const index = new ProjectIndex()
    index.updateFile(
      'main.tex',
      '\\definecolor{brand}{HTML}{111111}\n\\input{child}\n\\definecolor{brand}{HTML}{333333}',
    )
    index.updateFile('child.tex', '\\definecolor{brand}{HTML}{222222}')
    expect(index.getActiveColors('child.tex').map((color) => color.value)).toEqual([
      '111111',
      '222222',
      '333333',
    ])
  })

  it('keeps getAllLabels consistent after mutation (cache invalidation)', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{a}')
    expect(index.getAllLabels().map((l) => l.name)).toEqual(['a']) // populate cache
    index.updateFile('b.tex', '\\label{b}') // must invalidate
    expect(
      index
        .getAllLabels()
        .map((l) => l.name)
        .sort(),
    ).toEqual(['a', 'b'])
    index.removeFile('a.tex') // must invalidate
    expect(index.getAllLabels().map((l) => l.name)).toEqual(['b'])
  })

  it('finds label refs for a given name', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\ref{foo}\n\\ref{bar}\n\\ref{foo}')
    const refs = index.getAllLabelRefs('foo')
    expect(refs).toHaveLength(2)
  })

  it('aggregates command defs', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\newcommand{\\foo}{bar}')
    index.updateFile('macros.tex', '\\def\\baz{qux}')
    expect(index.getCommandDefs()).toHaveLength(2)
  })

  it('gets all unique environment names', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\begin{equation}\n\\end{equation}\n\\begin{equation}')
    expect(index.getAllEnvironments()).toEqual(['equation'])
  })

  // --- .aux integration ---
  it('updates aux data and resolves labels', () => {
    const index = new ProjectIndex()
    index.updateAux('\\newlabel{sec:intro}{{1}{1}}\n\\newlabel{eq:1}{{2.3}{5}}')
    expect(index.resolveLabel('sec:intro')).toBe('1')
    expect(index.resolveLabel('eq:1')).toBe('2.3')
    expect(index.resolveLabel('unknown')).toBeUndefined()
  })

  it('gets aux citations', () => {
    const index = new ProjectIndex()
    index.updateAux('\\bibcite{knuth84}{1}\n\\bibcite{lamport94}{2}')
    expect(index.getAuxCitations().size).toBe(2)
  })

  // --- find helpers ---
  it('findLabelDef returns the definition', () => {
    const index = new ProjectIndex()
    index.updateFile('ch1.tex', '\\label{sec:one}')
    const def = index.findLabelDef('sec:one')
    expect(def).toBeDefined()
    expect(def!.location.file).toBe('ch1.tex')
  })

  it('findLabelDef returns undefined for missing label', () => {
    const index = new ProjectIndex()
    expect(index.findLabelDef('nope')).toBeUndefined()
  })

  it('findAllOccurrences(command) returns the definition and every call site', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\newcommand{\\foo}{x}\n\\foo and \\foo')
    index.updateFile('ch.tex', '\\foo again')
    // definition's own \foo token + 2 uses in main + 1 use in ch
    expect(index.findAllOccurrences('foo', 'command')).toHaveLength(4)
  })

  it('findSymbolAt resolves a command call site (so rename works from a usage)', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\newcommand{\\foo}{x}\n\\foo')
    // cursor on the \foo usage at line 2, column 2 (the "f")
    expect(index.findSymbolAt('main.tex', 2, 2)).toEqual({ name: 'foo', type: 'command' })
    // a builtin/undefined command at a usage is not a renamable symbol
    index.updateFile('b.tex', '\\textbf{x}')
    expect(index.findSymbolAt('b.tex', 1, 3)).toBeUndefined()
  })

  it('findCommandDef returns the definition', () => {
    const index = new ProjectIndex()
    index.updateFile('defs.tex', '\\newcommand{\\hello}[1]{Hi #1}')
    const def = index.findCommandDef('hello')
    expect(def).toBeDefined()
    expect(def!.location.file).toBe('defs.tex')
    expect(def!.argCount).toBe(1)
  })

  it('findBibitemDef returns the definition', () => {
    const index = new ProjectIndex()
    index.updateFile('refs.tex', '\\bibitem{knuth84} The TeXbook.')
    const def = index.findBibitemDef('knuth84')
    expect(def).toBeDefined()
    expect(def!.location.file).toBe('refs.tex')
  })

  it('findBibitemDef returns undefined for missing key', () => {
    const index = new ProjectIndex()
    expect(index.findBibitemDef('nope')).toBeUndefined()
  })

  it('bib entries can be set and retrieved', () => {
    const index = new ProjectIndex()
    index.updateBib([
      {
        key: 'knuth84',
        type: 'book',
        title: 'TeXbook',
        author: 'Knuth',
        location: { file: 'refs.bib', line: 1, column: 1 },
      },
    ])
    expect(index.getBibEntries()).toHaveLength(1)
    expect(index.getBibEntries()[0]!.key).toBe('knuth84')
  })

  it('findBibEntry resolves by key, and updateBib replaces prior entries', () => {
    const bib = (key: string, type: string) => ({
      key,
      type,
      location: { file: 'refs.bib', line: 1, column: 1 },
    })
    const index = new ProjectIndex()
    index.updateBib([bib('a', 'book'), bib('b', 'article')])
    expect(index.findBibEntry('b')!.type).toBe('article')
    expect(index.findBibEntry('missing')).toBeUndefined()

    // A fresh updateBib must not leave stale keys resolvable.
    index.updateBib([bib('c', 'misc')])
    expect(index.findBibEntry('a')).toBeUndefined()
    expect(index.findBibEntry('c')!.type).toBe('misc')
  })

  // --- Engine commands (Phase 2: tab-separated, env detection, categorization) ---

  it('parses bare names (backward compat with old WASM)', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['align', 'gather', 'hbox'])
    const cmds = index.getEngineCommands()
    expect(cmds.size).toBe(3)
    expect(cmds.get('align')!.eqType).toBe(-1)
    expect(cmds.get('align')!.argCount).toBe(-1)
    expect(cmds.get('align')!.category).toBe('unknown')
  })

  it('parses tab-separated name\\teqType format (2-column)', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['align\t113', 'hbox\t21'])
    expect(index.getEngineCommands().get('align')!.eqType).toBe(113)
    expect(index.getEngineCommands().get('align')!.argCount).toBe(-1)
    expect(index.getEngineCommands().get('align')!.category).toBe('macro')
    expect(index.getEngineCommands().get('hbox')!.eqType).toBe(21)
    expect(index.getEngineCommands().get('hbox')!.category).toBe('primitive')
  })

  it('parses 3-column name\\teqType\\targCount format', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['frac\t113\t2', 'textbf\t113\t1', 'relax\t0\t-1'])
    const cmds = index.getEngineCommands()
    expect(cmds.get('frac')!.eqType).toBe(113)
    expect(cmds.get('frac')!.argCount).toBe(2)
    expect(cmds.get('frac')!.category).toBe('macro')
    expect(cmds.get('textbf')!.argCount).toBe(1)
    expect(cmds.get('relax')!.argCount).toBe(-1)
  })

  it('handles non-macro argCount as -1', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['hbox\t21\t-1'])
    expect(index.getEngineCommands().get('hbox')!.argCount).toBe(-1)
    expect(index.getEngineCommands().get('hbox')!.category).toBe('primitive')
  })

  it('detects environments from endXXX pattern', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['align', 'endalign', 'gather', 'endgather', 'endcsname'])
    const envs = index.getEngineEnvironments()
    expect(envs.has('align')).toBe(true)
    expect(envs.has('gather')).toBe(true)
    // csname is blocklisted
    expect(envs.has('csname')).toBe(false)
  })

  it('does not detect env if base name is missing', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands(['endalign'])
    expect(index.getEngineEnvironments().has('align')).toBe(false)
  })

  it('merges arg count from robust command inner macro (trailing space)', () => {
    const index = new ProjectIndex()
    // \frac is a 0-arg wrapper, \frac  (with space) is the real 2-arg macro
    index.updateEngineCommands([
      'frac\t111\t0',
      'frac \t112\t2',
      'textbf\t111\t0',
      'textbf \t112\t1',
      'par\t111\t0', // genuinely 0-arg, no inner macro
    ])
    const cmds = index.getEngineCommands()
    expect(cmds.get('frac')!.argCount).toBe(2)
    expect(cmds.get('textbf')!.argCount).toBe(1)
    expect(cmds.get('par')!.argCount).toBe(0) // stays 0, no space variant
  })

  it('filters LaTeX3 internal names containing _ or :', () => {
    const index = new ProjectIndex()
    index.updateEngineCommands([
      'intertext\t113',
      '__fp_sqrt:w\t114',
      'prop_if_in:NnTF\t114',
      'hbox\t21',
      'token_if_space:NTF\t114',
    ])
    const cmds = index.getEngineCommands()
    expect(cmds.has('intertext')).toBe(true)
    expect(cmds.has('hbox')).toBe(true)
    expect(cmds.has('__fp_sqrt:w')).toBe(false)
    expect(cmds.has('prop_if_in:NnTF')).toBe(false)
    expect(cmds.has('token_if_space:NTF')).toBe(false)
    expect(cmds.size).toBe(2)
  })

  // --- Semantic trace ---

  it('stores and retrieves semantic trace', () => {
    const index = new ProjectIndex()
    const trace: SemanticTrace = {
      labels: new Set(['sec:intro', 'eq:1']),
      refs: new Set(['sec:intro']),
    }
    index.updateSemanticTrace(trace)
    const got = index.getSemanticTrace()
    expect(got).not.toBeNull()
    expect(got!.labels.has('sec:intro')).toBe(true)
    expect(got!.labels.has('eq:1')).toBe(true)
    expect(got!.refs.has('sec:intro')).toBe(true)
  })

  it('starts with null semantic trace', () => {
    const index = new ProjectIndex()
    expect(index.getSemanticTrace()).toBeNull()
  })
})

describe('ProjectIndex — incremental update & O(result) lookups', () => {
  function buildLargeProject(fileCount: number): ProjectIndex {
    const index = new ProjectIndex()
    for (let f = 0; f < fileCount; f++) {
      const lines: string[] = []
      for (let i = 0; i < 20; i++) {
        lines.push(`\\label{lbl:${f}:${i}}`)
        lines.push(`See \\ref{lbl:${f}:${i}}.`)
      }
      index.updateFile(`file${f}.tex`, lines.join('\n'))
    }
    return index
  }

  it('updating one file does not affect symbols of other files', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{a:one}\n\\label{a:two}')
    index.updateFile('b.tex', '\\label{b:one}')

    // Re-edit a.tex: drop a:two, add a:three.
    index.updateFile('a.tex', '\\label{a:one}\n\\label{a:three}')

    expect(index.findLabelDef('a:two')).toBeUndefined() // removed
    expect(index.findLabelDef('a:three')).toBeDefined() // added
    expect(index.findLabelDef('a:one')).toBeDefined() // kept
    expect(index.findLabelDef('b:one')?.location.file).toBe('b.tex') // untouched
  })

  it('removeFile evicts that file from the inverted indexes', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{shared}\n\\ref{shared}')
    index.updateFile('b.tex', '\\label{shared}')
    expect(index.findAllOccurrences('shared', 'label')).toHaveLength(3)

    index.removeFile('b.tex')
    const remaining = index.findAllOccurrences('shared', 'label')
    expect(remaining).toHaveLength(2)
    expect(remaining.every((o) => o.filePath === 'a.tex')).toBe(true)
  })

  it('looks up symbols in O(result) time on a 300-file project', () => {
    const index = buildLargeProject(300) // 6000 labels + 6000 refs

    const start = performance.now()
    for (let iter = 0; iter < 30_000; iter++) {
      const f = iter % 300
      const i = iter % 20
      index.findLabelDef(`lbl:${f}:${i}`)
      index.getAllLabelRefs(`lbl:${f}:${i}`)
    }
    const elapsed = performance.now() - start

    // O(result) (Map-backed) does 60k lookups in a few ms. A full-project scan
    // (O(files × symbols)) would be orders of magnitude slower. Generous bound
    // to stay non-flaky on slow CI while still catching an O(project) regression.
    expect(elapsed).toBeLessThan(500)
  })
})
