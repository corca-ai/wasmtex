import { beforeAll, describe, expect, it } from 'vitest'
import { VirtualFS } from '../../fs/virtual-fs'
import {
  detectCompletionContext,
  positionAt,
  provideCompletions,
  provideDefinition,
  provideHover,
  provideReferences,
} from '../neutral-providers'
import { registerShard } from '../package-db'
import { ProjectIndex } from '../project-index'
import type { NeutralDocument, NeutralPosition } from '../protocol'
import type { BibEntry } from '../types'

// Single-line document whose `lineAt` returns the same content for any line, matching
// the existing test harness. Providers here operate on one line at position.line === 1.
function doc(line: string): NeutralDocument {
  return { path: 'main.tex', getText: () => line, lineAt: () => line }
}

/** 1-based column landing a little inside `sub` within `line`. */
function colIn(line: string, sub: string): NeutralPosition {
  return { line: 1, column: line.indexOf(sub) + 2 }
}

const loc = (file: string, line = 1, column = 1) => ({ file, line, column })

const emptyFs = () => new VirtualFS({ empty: true })

/** Completions with the cursor at the end of `line` — the common single-line case. */
function completionsAt(
  line: string,
  index: ProjectIndex,
  fs: VirtualFS = emptyFs(),
): ReturnType<typeof provideCompletions> {
  return provideCompletions(doc(line), { line: 1, column: line.length + 1 }, index, fs)
}

// A package shard contributes an environment name that is NOT in any engine-hash set, so
// completion/hover must fall through to getShardEnvironments(). Names are unique so the
// module-global shard registry can't collide with anything else.
beforeAll(() => {
  registerShard({
    package: 'myshardpkg',
    commands: [],
    environments: [{ name: 'myshardenv' }],
  })
})

// --- detectCompletionContext: branches not hit by the existing suite ---------

describe('detectCompletionContext (extra branches)', () => {
  it('resolves a plain \\cite prefix (no comma)', () => {
    expect(detectCompletionContext('\\cite{alpha', 12)).toEqual({ type: 'cite', prefix: 'alpha' })
  })

  it('resolves only the last segment of a \\cite comma list', () => {
    const line = '\\cite{a,bet'
    expect(detectCompletionContext(line, line.length + 1)).toEqual({ type: 'cite', prefix: 'bet' })
  })

  it('detects an \\end environment context', () => {
    const line = '\\end{item'
    expect(detectCompletionContext(line, line.length + 1)).toEqual({ type: 'end', prefix: 'item' })
  })

  it('detects a bare command context', () => {
    expect(detectCompletionContext('\\fra', 5)).toEqual({ type: 'command', prefix: 'fra' })
  })

  it('returns null when the cursor is not in any completion context', () => {
    expect(detectCompletionContext('plain text here', 6)).toBeNull()
  })
})

// --- provideCompletions dispatch + completeCommands ---------------------------

describe('provideCompletions: commands', () => {
  it('returns [] when there is no completion context', () => {
    expect(
      provideCompletions(doc('plain text'), { line: 1, column: 6 }, new ProjectIndex(), emptyFs()),
    ).toEqual([])
  })

  it('marks a package command as unavailable when the package is not loaded', () => {
    const items = completionsAt('\\dfrac', new ProjectIndex())
    const dfrac = items.find((i) => i.label === '\\dfrac')
    expect(dfrac).toBeDefined()
    expect(dfrac!.sortText).toBe('0b_dfrac')
    expect(dfrac!.documentation).toBe('Requires `\\usepackage{amsmath}`')
    expect(dfrac!.insertText).toBe('dfrac{$1}{$2}')
    expect(dfrac!.replaceLength).toBe(5)
  })

  it('marks a package command as available when the package is loaded', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\usepackage{amsmath}')
    const items = completionsAt('\\dfrac', index)
    const dfrac = items.find((i) => i.label === '\\dfrac')!
    expect(dfrac.sortText).toBe('0a_dfrac')
    expect(dfrac.documentation).toBe('Package: `amsmath`')
  })

  it('joins documentation and package requirement for a documented package command', () => {
    const items = completionsAt('\\includegraphics', new ProjectIndex())
    const gr = items.find((i) => i.label === '\\includegraphics')!
    expect(gr.detail).toBe('Include image')
    expect(gr.documentation).toContain('Include an image file.')
    expect(gr.documentation).toContain('Requires `\\usepackage{graphicx}`')
  })

  it('omits documentation for a command with neither docs nor package', () => {
    const items = completionsAt('\\textbf', new ProjectIndex())
    const tb = items.find((i) => i.label === '\\textbf')!
    expect(tb.detail).toBe('Bold text')
    expect(tb.documentation).toBeUndefined()
    expect(tb.sortText).toBe('0a_textbf')
  })

  it('surfaces user-defined commands and skips non-matching ones', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\newcommand{\\myusercmd}{x}\n\\newcommand{\\somethingelse}{y}')
    const items = completionsAt('\\myuser', index)
    const uc = items.find((i) => i.label === '\\myusercmd')!
    expect(uc.kind).toBe('variable')
    expect(uc.insertText).toBe('myusercmd')
    expect(uc.detail).toMatch(/^User command \(main\.tex:\d+\)$/)
    expect(uc.sortText).toBe('1_myusercmd')
    expect(items.some((i) => i.label === '\\somethingelse')).toBe(false)
  })
})

// --- appendEngineCommands (via completeCommands) ------------------------------

function engineIndex(): ProjectIndex {
  const index = new ProjectIndex()
  index.updateEngineCommands([
    'onemacro\t111\t1', // macro, 1 arg
    'twomacro\t111\t2', // macro, 2 args
    'noargmacro\t111\t0', // macro, 0 args
    'unkmacro\t111', // 2-column macro → argCount unknown (-1)
    'myprim\t50\t-1', // primitive (eqType > 0, not 111-118)
    'unkcmd\t0\t3', // unknown category (eqType 0), 3 args
    'frac\t111\t2', // collides with the builtin \frac → dedup
    'zzenv\t111\t3', // environment base (with endzzenv) whose macro carries an arg count
    'endzzenv\t111\t0',
  ])
  return index
}

function engineCompletions(prefix: string): ReturnType<typeof provideCompletions> {
  return completionsAt(`\\${prefix}`, engineIndex())
}

describe('appendEngineCommands', () => {
  it('renders a macro with a singular arg suffix and a snippet', () => {
    const item = engineCompletions('onemacro').find((i) => i.label === '\\onemacro')!
    expect(item.kind).toBe('text')
    expect(item.detail).toBe('Package macro (1 arg)')
    expect(item.insertText).toBe('onemacro{$1}')
    expect(item.snippet).toBe(true)
    expect(item.sortText).toBe('2_onemacro')
  })

  it('renders a macro with a plural arg suffix', () => {
    const item = engineCompletions('twomacro').find((i) => i.label === '\\twomacro')!
    expect(item.detail).toBe('Package macro (2 args)')
    expect(item.insertText).toBe('twomacro{$1}{$2}')
  })

  it('renders a zero-arg macro without a snippet', () => {
    const item = engineCompletions('noargmacro').find((i) => i.label === '\\noargmacro')!
    expect(item.detail).toBe('Package macro')
    expect(item.insertText).toBe('noargmacro')
    expect(item.snippet).toBe(false)
  })

  it('renders a TeX primitive with keyword kind', () => {
    const item = engineCompletions('myprim').find((i) => i.label === '\\myprim')!
    expect(item.kind).toBe('keyword')
    expect(item.detail).toBe('TeX primitive')
    expect(item.insertText).toBe('myprim')
  })

  it('renders an unknown-category engine command as a package command', () => {
    const item = engineCompletions('unkcmd').find((i) => i.label === '\\unkcmd')!
    expect(item.kind).toBe('text')
    expect(item.detail).toBe('Package command')
    expect(item.insertText).toBe('unkcmd{$1}{$2}{$3}')
  })

  it('does not shadow a builtin command with a same-named engine entry', () => {
    const items = engineCompletions('frac')
    expect(items.filter((i) => i.label === '\\frac')).toHaveLength(1)
  })
})

// --- completeRefs ------------------------------------------------------------

describe('provideCompletions: refs', () => {
  function refIndex(): ProjectIndex {
    const index = new ProjectIndex()
    index.updateFile('f.tex', '\\label{eq:one}\n\\label{other:two}')
    index.updateAuxData({
      labels: new Map([['eq:one', '1.1']]),
      citations: new Set(),
      includes: [],
    })
    return index
  }

  it('shows the resolved number for a label with aux data', () => {
    const index = refIndex()
    const items = completionsAt('\\ref{eq:', index)
    const item = items.find((i) => i.label === 'eq:one')!
    expect(item.kind).toBe('reference')
    expect(item.detail).toContain('[1.1]')
    expect(item.detail).toContain('f.tex:1')
    // 'other:two' does not start with 'eq:' → filtered out
    expect(items.some((i) => i.label === 'other:two')).toBe(false)
  })

  it('omits the bracketed number for an unresolved label', () => {
    const index = refIndex()
    const items = completionsAt('\\ref{other', index)
    const item = items.find((i) => i.label === 'other:two')!
    expect(item.detail).not.toContain('[')
    expect(item.detail).toContain('f.tex:2')
  })
})

// --- completeCites -----------------------------------------------------------

describe('provideCompletions: cites', () => {
  function citeIndex(): ProjectIndex {
    const index = new ProjectIndex()
    index.updateAuxData({
      labels: new Map(),
      citations: new Set(['auxkey', 'dup']),
      includes: [],
    })
    index.updateBib([
      { key: 'dup', type: 'article', author: 'X', year: '2000', location: loc('r.bib') },
      {
        key: 'withauthor',
        type: 'article',
        author: 'Smith',
        year: '2020',
        location: loc('r.bib', 2),
      },
      { key: 'withtitle', type: 'book', title: 'A Title', location: loc('r.bib', 3) },
      { key: 'typeonly', type: 'misc', location: loc('r.bib', 4) },
    ])
    return index
  }

  it('lists an aux citation and dedups the same key from the .bib', () => {
    const index = citeIndex()
    const items = completionsAt('\\cite{dup', index)
    const dups = items.filter((i) => i.label === 'dup')
    expect(dups).toHaveLength(1)
    expect(dups[0]!.detail).toBe('Citation')
  })

  it('lists an aux-only citation key', () => {
    const index = citeIndex()
    const items = completionsAt('\\cite{aux', index)
    expect(items.find((i) => i.label === 'auxkey')!.detail).toBe('Citation')
  })

  it('builds an author/year byline for a bib entry', () => {
    const index = citeIndex()
    const items = completionsAt('\\cite{with', index)
    expect(items.find((i) => i.label === 'withauthor')!.detail).toBe('Smith, 2020')
    expect(items.find((i) => i.label === 'withtitle')!.detail).toBe('A Title')
  })

  it('falls back to the entry type when there is no byline or title', () => {
    const index = citeIndex()
    const items = completionsAt('\\cite{typeonly', index)
    expect(items.find((i) => i.label === 'typeonly')!.detail).toBe('misc')
  })
})

// --- completeEnvironments + appendEngineEnvironments --------------------------

describe('provideCompletions: environments', () => {
  it('sorts builtin environments to the top in a \\begin context', () => {
    const items = completionsAt('\\begin{itemi', new ProjectIndex())
    const itemize = items.find((i) => i.label === 'itemize')!
    expect(itemize.kind).toBe('module')
    expect(itemize.detail).toBe('Unordered list')
    expect(itemize.sortText).toBe('0_itemize')
  })

  it('does not set the begin sortText in an \\end context', () => {
    const items = completionsAt('\\end{itemi', new ProjectIndex())
    const itemize = items.find((i) => i.label === 'itemize')!
    expect(itemize.sortText).toBeUndefined()
  })

  it('lists a project-used environment not in the builtin set', () => {
    const index = new ProjectIndex()
    index.updateFile('e.tex', '\\begin{projenv}\n\\end{projenv}')
    const items = completionsAt('\\begin{projenv', index)
    const item = items.find((i) => i.label === 'projenv')!
    expect(item.detail).toBe('Used in project')
    expect(item.sortText).toBe('1_projenv')
  })

  it('dedups a project env that is also a builtin', () => {
    const index = new ProjectIndex()
    index.updateFile('e.tex', '\\begin{center}\n\\end{center}')
    const items = completionsAt('\\begin{center', index)
    expect(items.filter((i) => i.label === 'center')).toHaveLength(1)
  })

  it('lists an engine environment with its arg count', () => {
    const items = completionsAt('\\begin{zz', engineIndex())
    const item = items.find((i) => i.label === 'zzenv')!
    expect(item.detail).toBe('Package environment (3 args)')
    expect(item.sortText).toBe('2_zzenv')
  })

  it('lists a shard environment with no arg count', () => {
    const items = completionsAt('\\begin{myshard', new ProjectIndex())
    const item = items.find((i) => i.label === 'myshardenv')!
    expect(item.detail).toBe('Package environment')
  })
})

// --- project resources + completeIncludes -----------------------------------

describe('provideCompletions: packages and includes', () => {
  it('filters project packages by prefix', () => {
    const fs = emptyFs()
    fs.writeFile('amsmath.sty', '')
    fs.writeFile('amssymb.sty', '')
    fs.writeFile('geometry.sty', '')
    const items = completionsAt('\\usepackage{ams', new ProjectIndex(), fs)
    const labels = items.map((i) => i.label)
    expect(labels).toContain('amsmath')
    expect(labels).toContain('amssymb')
    expect(labels.every((l) => l.startsWith('ams'))).toBe(true)
    expect(items[0]!.kind).toBe('module')
  })

  it('filters virtual-fs files by prefix for \\include', () => {
    const fs = emptyFs()
    fs.writeFile('chapter1.tex', 'a')
    fs.writeFile('chapter2.tex', 'b')
    fs.writeFile('intro.tex', 'c')
    const items = completionsAt('\\include{chap', new ProjectIndex(), fs)
    expect(items.map((i) => i.label).sort()).toEqual(['chapter1.tex', 'chapter2.tex'])
    expect(items[0]!.kind).toBe('file')
  })
})

// --- provideHover: environments ----------------------------------------------

describe('provideHover: environments', () => {
  it('shows detail and package for a builtin environment', () => {
    const hover = provideHover(
      doc('\\begin{align}'),
      colIn('\\begin{align}', 'align'),
      engineIndex(),
    )
    const text = hover!.contents.join('\n')
    expect(text).toContain('**align** environment')
    expect(text).toContain('Aligned equations')
    expect(text).toContain('Package: `amsmath`')
  })

  it('shows a builtin environment without a package', () => {
    const hover = provideHover(
      doc('\\begin{itemize}'),
      colIn('\\begin{itemize}', 'itemize'),
      new ProjectIndex(),
    )
    const text = hover!.contents.join('\n')
    expect(text).toContain('**itemize** environment')
    expect(text).not.toContain('Package:')
  })

  it('describes an engine environment and its arg count', () => {
    const hover = provideHover(
      doc('\\begin{zzenv}'),
      colIn('\\begin{zzenv}', 'zzenv'),
      engineIndex(),
    )
    const text = hover!.contents.join('\n')
    expect(text).toContain('**zzenv** — Package environment')
    expect(text).toContain('Arguments: 3')
  })

  it('describes a shard environment', () => {
    const hover = provideHover(
      doc('\\begin{myshardenv}'),
      colIn('\\begin{myshardenv}', 'myshardenv'),
      new ProjectIndex(),
    )
    expect(hover!.contents.join('\n')).toContain('**myshardenv** — Package environment')
  })

  it('falls back to a bare label for an unknown environment', () => {
    const hover = provideHover(
      doc('\\begin{totallyunknownenv}'),
      colIn('\\begin{totallyunknownenv}', 'totallyunknownenv'),
      new ProjectIndex(),
    )
    expect(hover!.contents).toEqual(['**totallyunknownenv** environment'])
  })
})

// --- provideHover: refs ------------------------------------------------------

describe('provideHover: refs', () => {
  it('shows the resolved value and definition site', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{eq:x}')
    index.updateAuxData({ labels: new Map([['eq:x', '3']]), citations: new Set(), includes: [] })
    const line = '\\ref{eq:x}'
    const hover = provideHover(doc(line), colIn(line, 'eq:x'), index)
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\ref{eq:x}** = 3')
    expect(text).toContain('Defined at main.tex:1')
  })

  it('shows a bare ref when unresolved and undefined', () => {
    const line = '\\ref{ghost}'
    const hover = provideHover(doc(line), colIn(line, 'ghost'), new ProjectIndex())
    expect(hover!.contents).toEqual(['**\\ref{ghost}**'])
  })

  it('uses the whole trimmed group when the comma segment under the cursor is empty', () => {
    // Cursor on the empty first segment of \cref{,fig:b}: commaKeyAtCol returns null, so the
    // fallback `refM[1].trim()` keys the whole ",fig:b" blob (which no index holds).
    const line = '\\cref{,fig:b}'
    const hover = provideHover(doc(line), { line: 1, column: 7 }, new ProjectIndex())
    expect(hover!.contents).toEqual(['**\\ref{,fig:b}**'])
  })
})

// --- provideHover: cites -----------------------------------------------------

describe('provideHover: cites', () => {
  function bibIndex(entries: BibEntry[]): ProjectIndex {
    const index = new ProjectIndex()
    index.updateBib(entries)
    return index
  }

  it('renders a formatted preview for a rich bib entry', () => {
    const index = bibIndex([
      {
        key: 'k1',
        type: 'article',
        author: 'Smith',
        year: '2020',
        title: 'On Things',
        location: loc('r.bib'),
      },
    ])
    const line = '\\cite{k1}'
    const hover = provideHover(doc(line), colIn(line, 'k1'), index)
    const text = hover!.contents.join('\n')
    expect(text).toContain('**[k1]** article')
    expect(text).toContain('Smith (2020)')
    expect(text).toContain('*On Things*')
  })

  it('omits the preview when the entry has no formattable fields', () => {
    const index = bibIndex([{ key: 'k2', type: 'misc', location: loc('r.bib') }])
    const line = '\\cite{k2}'
    const hover = provideHover(doc(line), colIn(line, 'k2'), index)
    expect(hover!.contents).toEqual(['**[k2]** misc'])
  })

  it('shows a bare key for a missing entry and handles a comma list', () => {
    const index = bibIndex([{ key: 'known', type: 'book', location: loc('r.bib') }])
    const line = '\\cite{known,missing}'
    const hover = provideHover(doc(line), colIn(line, 'known'), index)
    const text = hover!.contents.join('\n')
    expect(text).toContain('**[known]** book')
    expect(text).toContain('**[missing]**')
  })
})

// --- provideHover: commands --------------------------------------------------

describe('provideHover: commands', () => {
  it('shows detail, signature, documentation for a builtin command', () => {
    const line = '\\frac{a}{b}'
    const hover = provideHover(doc(line), colIn(line, 'frac'), new ProjectIndex())
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\frac** — Fraction')
    expect(text).toContain('\\frac{}{}')
    expect(text).toContain('Typeset a fraction')
  })

  it('shows the package line for a builtin command with a package', () => {
    const line = '\\includegraphics{a}'
    const hover = provideHover(doc(line), colIn(line, 'includegraphics'), new ProjectIndex())
    expect(hover!.contents.join('\n')).toContain('Package: `graphicx`')
  })

  it('omits the signature line for an argument-less command', () => {
    const line = '\\maketitle'
    const hover = provideHover(doc(line), colIn(line, 'maketitle'), new ProjectIndex())
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\maketitle**')
    // \maketitle has no braced args → no signature backtick line
    expect(text).not.toContain('\\maketitle{')
  })

  it('describes a user-defined command', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\newcommand{\\myuc}{x}')
    const line = '\\myuc'
    const hover = provideHover(doc(line), colIn(line, 'myuc'), index)
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\myuc** — User-defined command')
    expect(text).toContain('Defined at main.tex:1')
  })

  it('describes an engine macro with its argument count', () => {
    const line = '\\onemacro'
    const hover = provideHover(doc(line), colIn(line, 'onemacro'), engineIndex())
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\onemacro** — Package macro')
    expect(text).toContain('Arguments: 1')
  })

  it('describes an engine macro with zero arguments', () => {
    const line = '\\noargmacro'
    const hover = provideHover(doc(line), colIn(line, 'noargmacro'), engineIndex())
    expect(hover!.contents.join('\n')).toContain('Arguments: none')
  })

  it('omits the arguments line for an engine macro of unknown arity', () => {
    const line = '\\unkmacro'
    const hover = provideHover(doc(line), colIn(line, 'unkmacro'), engineIndex())
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\unkmacro** — Package macro')
    expect(text).not.toContain('Arguments:')
  })

  it('labels a TeX primitive without an arguments line', () => {
    const line = '\\myprim'
    const hover = provideHover(doc(line), colIn(line, 'myprim'), engineIndex())
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\myprim** — TeX primitive')
    expect(text).not.toContain('Arguments:')
  })

  it('labels an unknown-category engine command as a package command', () => {
    const line = '\\unkcmd'
    const hover = provideHover(doc(line), colIn(line, 'unkcmd'), engineIndex())
    expect(hover!.contents.join('\n')).toContain('**\\unkcmd** — Package command')
  })

  it('returns null hover for an unknown command', () => {
    const line = '\\zzznotacommand'
    expect(provideHover(doc(line), colIn(line, 'zzznotacommand'), new ProjectIndex())).toBeNull()
  })

  it('skips an earlier command match to hover the token under the cursor', () => {
    // Two commands on one line; the cursor is on the second. findAtCol must skip the first
    // match (which does not contain the column) and return the second.
    const line = '\\alpha\\frac{a}{b}'
    const hover = provideHover(doc(line), colIn(line, 'frac'), new ProjectIndex())
    const text = hover!.contents.join('\n')
    expect(text).toContain('**\\frac**')
    expect(text).not.toContain('alpha')
  })

  it('returns null hover when the cursor is on plain text', () => {
    expect(provideHover(doc('just words'), { line: 1, column: 3 }, new ProjectIndex())).toBeNull()
  })
})

// --- provideDefinition -------------------------------------------------------

describe('provideDefinition (extra branches)', () => {
  it('jumps to a label definition from a \\ref', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{eq:x}')
    const line = '\\ref{eq:x}'
    const target = provideDefinition(doc(line), colIn(line, 'eq:x'), index)
    expect(target).not.toBeNull()
    expect(target!.file).toBe('main.tex')
    expect(target!.range.startLine).toBe(1)
  })

  it('returns null for a \\ref to an unknown label', () => {
    const line = '\\ref{nowhere}'
    expect(provideDefinition(doc(line), colIn(line, 'nowhere'), new ProjectIndex())).toBeNull()
  })

  it('returns null when the ref comma segment under the cursor is empty', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{fig:b}')
    // Cursor on the empty first segment of \cref{,fig:b}.
    expect(provideDefinition(doc('\\cref{,fig:b}'), { line: 1, column: 7 }, index)).toBeNull()
  })

  it('resolves the first key when the cursor is on the command name itself', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{fig:a}')
    // column 1 lands on the leading backslash → commaKeyAtCol falls back to the first key.
    const target = provideDefinition(doc('\\cref{fig:a}'), { line: 1, column: 1 }, index)
    expect(target).not.toBeNull()
    expect(target!.range.startLine).toBe(1)
  })

  it('returns null when on the command name and the first comma segment is empty', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\label{fig:b}')
    // Cursor on the "cref" name (col 3): the loop matches no segment and the first-key
    // fallback yields an empty string → null.
    expect(provideDefinition(doc('\\cref{,fig:b}'), { line: 1, column: 3 }, index)).toBeNull()
  })

  it('jumps to a \\bibitem definition when no .bib entry exists', () => {
    const index = new ProjectIndex()
    index.updateFile('refs.tex', '\\bibitem{bk} Ref text')
    const line = '\\cite{bk}'
    const target = provideDefinition(doc(line), colIn(line, 'bk'), index)
    expect(target).not.toBeNull()
    expect(target!.file).toBe('refs.tex')
  })

  it('returns null for a cite key with neither entry nor bibitem', () => {
    const line = '\\cite{ghostkey}'
    expect(provideDefinition(doc(line), colIn(line, 'ghostkey'), new ProjectIndex())).toBeNull()
  })

  it('returns null when the cite comma segment under the cursor is empty', () => {
    const index = new ProjectIndex()
    index.updateBib([{ key: 'beta', type: 'book', location: loc('r.bib') }])
    // Cursor on the empty first segment of \cite{,beta}.
    expect(provideDefinition(doc('\\cite{,beta}'), { line: 1, column: 7 }, index)).toBeNull()
  })

  it('jumps to a user command definition', () => {
    const index = new ProjectIndex()
    index.updateFile('main.tex', '\\newcommand{\\mycmd}{x}')
    const line = '\\mycmd'
    const target = provideDefinition(doc(line), colIn(line, 'mycmd'), index)
    expect(target).not.toBeNull()
    expect(target!.file).toBe('main.tex')
  })

  it('returns null for a command with no definition', () => {
    const line = '\\notdefined'
    expect(provideDefinition(doc(line), colIn(line, 'notdefined'), new ProjectIndex())).toBeNull()
  })

  it('returns null when the cursor is on plain text', () => {
    expect(
      provideDefinition(doc('plain words'), { line: 1, column: 3 }, new ProjectIndex()),
    ).toBeNull()
  })
})

// --- provideReferences -------------------------------------------------------

describe('provideReferences', () => {
  it('returns all uses of a label when on its \\label definition', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{eq:y}')
    index.updateFile('b.tex', '\\ref{eq:y} then \\ref{eq:y}')
    const line = '\\label{eq:y}'
    const refs = provideReferences(doc(line), colIn(line, 'eq:y'), index)
    expect(refs).toHaveLength(2)
    expect(refs.every((r) => r.file === 'b.tex')).toBe(true)
  })

  it('returns the definition plus all uses when on a \\ref', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{eq:y}')
    index.updateFile('b.tex', '\\ref{eq:y} then \\ref{eq:y}')
    const line = '\\ref{eq:y}'
    const refs = provideReferences(doc(line), colIn(line, 'eq:y'), index)
    // 1 definition (a.tex) + 2 uses (b.tex)
    expect(refs).toHaveLength(3)
    expect(refs.some((r) => r.file === 'a.tex')).toBe(true)
  })

  it('returns [] when the ref comma segment under the cursor is empty', () => {
    const index = new ProjectIndex()
    index.updateFile('a.tex', '\\label{fig:b}')
    expect(provideReferences(doc('\\cref{,fig:b}'), { line: 1, column: 7 }, index)).toEqual([])
  })

  it('returns only the uses for a label that is referenced but never defined', () => {
    const index = new ProjectIndex()
    index.updateFile('b.tex', '\\ref{eq:z} then \\ref{eq:z}')
    const line = '\\ref{eq:z}'
    const refs = provideReferences(doc(line), colIn(line, 'eq:z'), index)
    // No \label definition exists → only the two \ref uses come back.
    expect(refs).toHaveLength(2)
    expect(refs.every((r) => r.file === 'b.tex')).toBe(true)
  })

  it('returns every occurrence of a citation key', () => {
    const index = new ProjectIndex()
    index.updateFile('c.tex', '\\cite{ck} and \\cite{ck}')
    index.updateBib([{ key: 'ck', type: 'article', location: loc('r.bib') }])
    const line = '\\cite{ck}'
    const refs = provideReferences(doc(line), colIn(line, 'ck'), index)
    // 2 citations + 1 bib entry
    expect(refs).toHaveLength(3)
  })

  it('returns [] when the cite comma segment under the cursor is empty', () => {
    const index = new ProjectIndex()
    index.updateFile('c.tex', '\\cite{ck}')
    expect(provideReferences(doc('\\cite{,ck}'), { line: 1, column: 7 }, index)).toEqual([])
  })

  it('returns every occurrence of a user-defined command', () => {
    const index = new ProjectIndex()
    index.updateFile('d.tex', '\\newcommand{\\mycmd}{x}\n\\mycmd\n\\mycmd')
    const line = '\\mycmd here'
    const refs = provideReferences(doc(line), colIn(line, 'mycmd'), index)
    // definition-name token + 2 call sites
    expect(refs).toHaveLength(3)
    expect(refs.every((r) => r.file === 'd.tex')).toBe(true)
  })

  it('returns [] for a builtin command with no user definition', () => {
    const line = '\\textbf{x}'
    expect(provideReferences(doc(line), colIn(line, 'textbf'), new ProjectIndex())).toEqual([])
  })

  it('returns [] when the cursor is on plain text', () => {
    expect(
      provideReferences(doc('plain words'), { line: 1, column: 3 }, new ProjectIndex()),
    ).toEqual([])
  })
})

// --- positionAt --------------------------------------------------------------

describe('positionAt', () => {
  it('maps offset 0 to line 1, column 1', () => {
    expect(positionAt('abc\ndef', 0)).toEqual({ line: 1, column: 1 })
  })

  it('maps an offset onto a later line', () => {
    // offset 4 is the first character of the second line ('d').
    expect(positionAt('abc\ndef', 4)).toEqual({ line: 2, column: 1 })
  })
})
