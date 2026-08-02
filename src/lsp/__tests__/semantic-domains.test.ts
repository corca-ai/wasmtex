import { describe, expect, it } from 'vitest'
import { type JsonRpcMessage, LatexLspServer } from '../../lsp-server'
import { LatexLanguageService } from '../../lsp-service'
import { analyzeBibCompletionContext } from '../bib-completion-context'
import { parseLatexFile } from '../latex-parser'
import type { NeutralCompletionItem, NeutralDocument, NeutralPosition } from '../protocol'

function cursor(source: string): { text: string; line: number; column: number } {
  const offset = source.indexOf('¦')
  if (offset < 0) throw new Error('fixture requires a cursor marker')
  const text = source.slice(0, offset) + source.slice(offset + 1)
  const before = source.slice(0, offset)
  const lines = before.split('\n')
  return { text, line: lines.length, column: lines.at(-1)!.length + 1 }
}

function bibDocument(source: string): { document: NeutralDocument; position: NeutralPosition } {
  const marked = cursor(source)
  const lines = marked.text.split('\n')
  return {
    document: {
      path: 'refs.bib',
      getText: () => marked.text,
      lineAt: (line) => lines[line - 1] ?? '',
    },
    position: { line: marked.line, column: marked.column },
  }
}

const DEFINITIONS = String.raw`
\newcounter{theorem}
\newlength{\proofwidth}
\newtheorem{lemma}{Lemma}
\newglossaryentry{tensor}{name={tensor},description={A tensor}}
\newacronym{fft}{FFT}{fast Fourier transform}
\newfontfamily\bodyfont{Project Serif}
\definechoicekey{layout}{mode}{draft,final}{}
`

function projectService(main: string, extra: Record<string, string> = {}): LatexLanguageService {
  return new LatexLanguageService({
    lint: false,
    files: {
      'chapters/main.tex': `${String.raw`\input{../defs}`}
${main}`,
      'defs.tex': DEFINITIONS,
      ...extra,
    },
  })
}

function completions(source: string, extra: Record<string, string> = {}): NeutralCompletionItem[] {
  const marked = cursor(source)
  const service = projectService(marked.text, extra)
  return service.getCompletions('chapters/main.tex', marked.line + 1, marked.column)
}

function rpcLabels(path: string, source: string, files: Record<string, string> = {}): string[] {
  const marked = cursor(source)
  const sent: JsonRpcMessage[] = []
  const server = new LatexLspServer((message) => sent.push(message), {
    files: { ...files, [path]: marked.text },
    lint: false,
  })
  server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'textDocument/completion',
    params: {
      textDocument: { uri: `file:///${path}` },
      position: { line: marked.line - 1, character: marked.column - 1 },
    },
  })
  const response = sent.find((message) => message.id === 1)?.result as
    | { items: Array<{ label: string }> }
    | undefined
  return response?.items.map((item) => item.label) ?? []
}

describe('project semantic domains', () => {
  it('extracts declarations with source provenance', () => {
    const symbols = parseLatexFile(DEFINITIONS, 'defs.tex')
    expect(symbols.counters.map((value) => value.name)).toContain('theorem')
    expect(symbols.lengths.map((value) => value.name)).toContain('\\proofwidth')
    expect(symbols.environmentDefs.map((value) => value.name)).toContain('lemma')
    expect(symbols.glossaryEntries.map((value) => value.name)).toContain('tensor')
    expect(symbols.acronymEntries.map((value) => value.name)).toContain('fft')
    expect(symbols.fontFamilies).toMatchObject([
      { name: 'Project Serif', role: 'alias', target: '\\bodyfont' },
    ])
    expect(symbols.keys).toMatchObject([
      { family: 'layout', name: 'mode', valueType: 'enum', values: ['draft', 'final'] },
    ])
  })

  it('parses optional and braced semantic invocations without changing their domains', () => {
    const symbols = parseLatexFile(
      String.raw`
\LoadClass[draft]{book}
\addglobalbib[location=remote]{refs.bib}
\Gls*[format=emph]{tensor}
\Ac*[long-short]{fft}
\fontspec[Ligatures=TeX]{Project Serif}
\newfontface{\displayfont}[Color=blue]{Project Sans}
\DeclareFontFamily{TU}{project}{}
\define@key[prefix]{layout}{mode}{}`,
      'semantic.sty',
    )

    expect(symbols.classes).toMatchObject([{ name: 'book', options: 'draft' }])
    expect(symbols.bibliographies).toMatchObject([{ path: 'refs.bib' }])
    expect(symbols.glossaryEntries).toMatchObject([{ name: 'tensor', role: 'usage' }])
    expect(symbols.acronymEntries).toMatchObject([{ name: 'fft', role: 'usage' }])
    expect(symbols.fontFamilies).toMatchObject([
      { name: 'Project Serif', role: 'usage' },
      { name: 'Project Sans', role: 'alias', target: '\\displayfont' },
      { name: 'project', role: 'definition' },
    ])
    expect(symbols.keys).toMatchObject([{ family: 'layout', name: 'mode', valueType: 'free-text' }])
  })

  it('recovers LaTeX3 and pgfkeys choice values', () => {
    const symbols = parseLatexFile(
      String.raw`\DeclareKeys[layout]{
  mode .choice:,
  mode / draft .code:n = {},
  mode / final .code:n = {}
}
\pgfkeys{/theme/.is family,/theme/.cd,tone/.is choice,tone/dark/.code={}}`,
      'keys.sty',
    )
    expect(
      symbols.keys.find((key) => key.family === 'layout' && key.name === 'mode'),
    ).toMatchObject({ valueType: 'enum', values: ['draft', 'final'] })
    expect(symbols.keys.find((key) => key.family === 'theme' && key.name === 'tone')).toMatchObject(
      {
        valueType: 'enum',
        values: ['dark'],
      },
    )
  })

  it.each([
    [String.raw`\setcounter{the¦}`, 'theorem'],
    [String.raw`\setlength{\proof¦}`, '\\proofwidth'],
    [String.raw`\begin{lem¦}`, 'lemma'],
    [String.raw`\gls{ten¦}`, 'tensor'],
    [String.raw`\acrshort{ff¦}`, 'fft'],
    [String.raw`\setmainfont{Project¦}`, 'Project Serif'],
    [String.raw`\setkeys{layout}{mo¦}`, 'mode'],
    [String.raw`\setkeys{layout}{mode=fi¦}`, 'final'],
  ])('completes %s from the active include graph', (source, expected) => {
    const items = completions(source)
    const item = items.find((candidate) => candidate.label === expected)
    expect(item?.detail).toBeTruthy()
    expect(item?.documentation ?? item?.detail).toContain(
      expected === 'final' ? 'Project enum' : expected === 'lemma' ? 'Project' : '',
    )
  })

  it('drops values after an included file is removed', () => {
    const marked = cursor(String.raw`\setcounter{the¦}`)
    const service = projectService(marked.text)
    expect(
      service
        .getCompletions('chapters/main.tex', marked.line + 1, marked.column)
        .map((item) => item.label),
    ).toContain('theorem')
    service.removeFile('defs.tex')
    expect(
      service
        .getCompletions('chapters/main.tex', marked.line + 1, marked.column)
        .map((item) => item.label),
    ).not.toContain('theorem')
  })

  it('follows project package and class load edges', () => {
    const marked = cursor(String.raw`\usepackage{local}
\setcounter{pac¦}`)
    const service = new LatexLanguageService({
      lint: false,
      files: {
        'main.tex': marked.text,
        'local.sty': '\\newcounter{packagecounter}',
      },
    })
    expect(
      service.getCompletions('main.tex', marked.line, marked.column).map((item) => item.label),
    ).toContain('packagecounter')
  })

  it('scopes bibliography entries to the active document graph', () => {
    const service = new LatexLanguageService({
      lint: false,
      files: {
        'a/main.tex': '\\bibliography{refs}\n\\cite{',
        'a/refs.bib': '@book{alpha, title={A}}',
        'b/main.tex': '\\bibliography{refs}\n\\cite{',
        'b/refs.bib': '@book{beta, title={B}}',
      },
    })
    expect(service.getCompletions('a/main.tex', 2, 7).map((item) => item.label)).toEqual(['alpha'])
    expect(service.getCompletions('b/main.tex', 2, 7).map((item) => item.label)).toEqual(['beta'])
    service.updateFile('a/refs.bib', '@book{gamma, title={G}}')
    expect(service.getCompletions('a/main.tex', 2, 7).map((item) => item.label)).toEqual(['gamma'])
  })

  it('applies deterministic include-order shadowing to project enum values', () => {
    const marked = cursor(String.raw`\definechoicekey{layout}{mode}{before}{}
\input{defs}
\definechoicekey{layout}{mode}{after}{}
\setkeys{layout}{mode=¦}`)
    const service = new LatexLanguageService({
      lint: false,
      files: {
        'main.tex': marked.text,
        'defs.tex': '\\definechoicekey{layout}{mode}{included}{}',
      },
    })
    const labels = service
      .getCompletions('main.tex', marked.line, marked.column)
      .map((item) => item.label)
    expect(labels).toContain('after')
    expect(labels).not.toContain('before')
    expect(labels).not.toContain('included')
  })
})

describe('typed project file completion', () => {
  const files = {
    'chapters/section.tex': '',
    'images/figure.png': '',
    'images/wrong.csv': '',
    'data/results.csv': '',
    'code/example.py': '',
    'refs/library.bib': '',
  }

  it.each([
    [String.raw`\includegraphics{../images/fi¦}`, '../images/figure.png', 'wrong.csv'],
    [String.raw`\csvreader{../data/re¦}`, '../data/results.csv', 'figure.png'],
    [String.raw`\lstinputlisting{../code/ex¦}`, '../code/example.py', 'figure.png'],
    [String.raw`\addbibresource{../refs/li¦}`, '../refs/library.bib', 'section.tex'],
    [String.raw`\input{./se¦}`, './section.tex', 'figure.png'],
  ])('filters compatible paths for %s', (source, expected, excluded) => {
    const items = completions(source, files)
    expect(items.map((item) => item.label)).toContain(expected)
    expect(items.map((item) => item.label).join(' ')).not.toContain(excluded)
  })

  it('preserves project-root path style', () => {
    const items = completions(String.raw`\includegraphics{/images/fi¦}`, files)
    expect(items.map((item) => item.insertText)).toContain('/images/figure.png')
  })
})

describe('BibTeX completion context', () => {
  it.each([
    ['@art¦icle', 'bib-entry-type', 'art', 2, 9],
    ['@article{key,\n  ti¦tle = {X}\n}', 'bib-field', 'ti', 3, 8],
    ['@article{key,\n  crossref = {par¦ent}\n}', 'bib-entry-key', 'par', 15, 21],
    ['@article{key,\n  month = ja¦n\n}', 'bib-string', 'ja', 11, 14],
    ['@article{key,\n  title = {X},\n  cro¦', 'bib-field', 'cro', 3, 6],
  ])('analyzes incomplete source safely: %s', (source, domain, prefix, start, end) => {
    const fixture = bibDocument(source)
    const context = analyzeBibCompletionContext(fixture.document, fixture.position)
    expect(context).toMatchObject({ domain, prefix })
    expect(context!.replacementRange.startColumn).toBe(start)
    expect(context!.replacementRange.endColumn).toBe(end)
  })

  it('completes entry types, ranked fields, crossrefs, and string macros', () => {
    const bib = `@string{jml = "Journal"}
@book{parent, title={Parent}}
@article{child,
  title = {Child},
  crossref = {parent},
  month = jml
}`
    const service = new LatexLanguageService({ files: { 'refs.bib': bib }, lint: false })
    const cases = [
      ['@art', 1, 5, 'article'],
      [bib, 4, 3, 'author'],
      [bib, 5, 21, 'parent'],
      [bib, 6, 14, 'jml'],
    ] as const
    for (const [source, line, column, expected] of cases) {
      if (source !== bib) service.updateFile('refs.bib', source)
      else service.updateFile('refs.bib', bib)
      expect(service.getCompletions('refs.bib', line, column).map((item) => item.label)).toContain(
        expected,
      )
    }
  })
})

describe('JSON-RPC semantic completion parity', () => {
  const latexFiles = {
    'defs.tex': DEFINITIONS,
    'chapters/section.tex': '',
    'images/figure.png': '',
    'data/results.csv': '',
    'code/example.py': '',
    'refs/library.bib': '',
  }

  it.each([
    [
      String.raw`\input{../defs}
\setcounter{the¦}`,
      'theorem',
    ],
    [
      String.raw`\input{../defs}
\setlength{\proof¦}`,
      '\\proofwidth',
    ],
    [
      String.raw`\input{../defs}
\begin{lem¦}`,
      'lemma',
    ],
    [
      String.raw`\input{../defs}
\gls{ten¦}`,
      'tensor',
    ],
    [
      String.raw`\input{../defs}
\acrshort{ff¦}`,
      'fft',
    ],
    [
      String.raw`\input{../defs}
\setmainfont{Project¦}`,
      'Project Serif',
    ],
    [
      String.raw`\input{../defs}
\setkeys{layout}{mo¦}`,
      'mode',
    ],
    [
      String.raw`\input{../defs}
\setkeys{layout}{mode=fi¦}`,
      'final',
    ],
    [String.raw`\input{./se¦}`, './section.tex'],
    [String.raw`\includegraphics{../images/fi¦}`, '../images/figure.png'],
    [String.raw`\lstinputlisting{../code/ex¦}`, '../code/example.py'],
    [String.raw`\csvreader{../data/re¦}`, '../data/results.csv'],
    [String.raw`\addbibresource{../refs/li¦}`, '../refs/library.bib'],
  ])('returns %s through textDocument/completion', (source, expected) => {
    expect(rpcLabels('chapters/main.tex', source, latexFiles)).toContain(expected)
  })

  it.each([
    ['@art¦', 'article'],
    ['@article{child,\n  ti¦', 'title'],
    ['@book{parent, title={P}}\n@article{child, crossref={par¦}}', 'parent'],
    ['@string{journalname="Journal"}\n@article{child, journal=jour¦}', 'journalname'],
  ])('returns BibTeX domain values through JSON-RPC: %s', (source, expected) => {
    expect(rpcLabels('refs.bib', source)).toContain(expected)
  })
})
