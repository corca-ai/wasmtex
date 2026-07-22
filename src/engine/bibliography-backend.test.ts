import { describe, expect, it } from 'vitest'
import { VirtualFS } from '../fs/virtual-fs'
import { parseBibFile } from '../lsp/bib-parser'
import type { BibEntry } from '../lsp/types'
import { BackendRegistry, BIBER_STAGE, BIBTEX_STAGE, type ToolBackend } from './backend-registry'
import { type BiberRequest, runRemoteBiber } from './biber-backend'
import {
  type BibliographyBackend,
  type BibliographyStageRequest,
  biblatexLiteBackend,
  detectBiblatexBackend,
  detectBiblatexSort,
  detectBibliographyMode,
  generateBiblatexBbl,
  parseBcfCitedKeys,
  resolveBstFile,
  runRemoteBibliography,
  selectBiblatexBackend,
} from './bibliography-backend'
import { MemoryCacheStore, withCache } from './content-cache'

function entry(partial: Partial<BibEntry> & { key: string }): BibEntry {
  return { type: 'article', location: { file: 'refs.bib', line: 1, column: 1 }, ...partial }
}

describe('detectBibliographyMode', () => {
  it('detects biblatex', () => {
    expect(detectBibliographyMode('\\usepackage{biblatex}')).toBe('biblatex')
    expect(detectBibliographyMode('\\usepackage[backend=biber,style=numeric]{biblatex}')).toBe(
      'biblatex',
    )
  })

  it('detects classic bibtex', () => {
    expect(detectBibliographyMode('\\bibliography{refs}\n\\bibliographystyle{plain}')).toBe(
      'bibtex',
    )
    expect(detectBibliographyMode('\\begin{thebibliography}{9}')).toBe('bibtex')
  })

  it('returns none for a plain document', () => {
    expect(
      detectBibliographyMode('\\documentclass{article}\\begin{document}hi\\end{document}'),
    ).toBe('none')
  })

  it('ignores commented-out directives', () => {
    expect(detectBibliographyMode('% \\usepackage{biblatex}\ntext')).toBe('none')
    expect(detectBibliographyMode('% \\bibliography{refs}')).toBe('none')
  })

  it('treats % after an escaped backslash (\\\\%) as a comment', () => {
    // `\\` is an escaped backslash (even run) so the following `%` is a real comment.
    expect(detectBibliographyMode(String.raw`Row one \\% TODO \bibliography{refs}`)).toBe('none')
  })

  it('keeps a directive after an escaped literal percent (\\%)', () => {
    // `\%` is a literal percent (odd run), not a comment, so the directive still counts.
    expect(detectBibliographyMode(String.raw`50\% done \bibliography{refs}`)).toBe('bibtex')
  })
})

describe('detectBiblatexBackend', () => {
  it('defaults to biber', () => {
    expect(detectBiblatexBackend('\\usepackage{biblatex}')).toBe('biber')
    expect(detectBiblatexBackend('\\usepackage[style=numeric]{biblatex}')).toBe('biber')
  })
  it('honors backend=bibtex', () => {
    expect(detectBiblatexBackend('\\usepackage[backend=bibtex]{biblatex}')).toBe('bibtex')
  })
  it('ignores commented-out biblatex backend directives', () => {
    // A commented line must not be read first; the live \usepackage{biblatex} defaults to biber.
    expect(
      detectBiblatexBackend('% \\usepackage[backend=bibtex]{biblatex}\n\\usepackage{biblatex}\n'),
    ).toBe('biber')
  })
})

describe('detectBiblatexSort', () => {
  it('defaults to nty', () => {
    expect(detectBiblatexSort('\\usepackage{biblatex}')).toBe('nty')
    expect(detectBiblatexSort('\\usepackage[style=numeric,sorting=nyt]{biblatex}')).toBe('nty')
  })
  it('honors sorting=none (cite order)', () => {
    expect(detectBiblatexSort('\\usepackage[sorting=none]{biblatex}')).toBe('none')
    expect(detectBiblatexSort('\\ExecuteBibliographyOptions{sorting = none}')).toBe('none')
  })
  it('ignores a commented-out sorting=none', () => {
    expect(detectBiblatexSort('% sorting=none\n\\usepackage{biblatex}')).toBe('nty')
  })
})

describe('parseBcfCitedKeys', () => {
  const bcf = [
    '<bcf:section number="0">',
    '  <bcf:citekey order="1" intorder="1">knuth84</bcf:citekey>',
    '  <bcf:citekey order="2" intorder="1">lamport94</bcf:citekey>',
    '</bcf:section>',
  ].join('\n')

  it('extracts cited keys in citation order', () => {
    expect(parseBcfCitedKeys(bcf)).toEqual(['knuth84', 'lamport94'])
  })
  it('returns [] for a .bcf with no citations', () => {
    expect(parseBcfCitedKeys('<bcf:controlfile></bcf:controlfile>')).toEqual([])
  })
  it('passes through a * key (\\nocite{*}) for the caller to expand', () => {
    expect(parseBcfCitedKeys('<bcf:citekey order="1">*</bcf:citekey>')).toEqual(['*'])
  })
})

// The composition `maybeRunBiblatex` inlines for its client fallback: cited keys from the
// .bcf + entries from the project .bib → the biblatex-lite .bbl. Proven here without a WASM
// engine (the engine round-trip is the opt-in real-Biber e2e, #175).
describe('biblatex-lite from a .bcf (compile-flow composition)', () => {
  const bib = [
    '@book{knuth84, author={Knuth, Donald}, title={Literate Programming}, year={1984}}',
    '@book{lamport94, author={Lamport, Leslie}, title={LaTeX}, year={1994}}',
    '@book{unused, title={Never cited}}',
  ].join('\n')
  const bcf = [
    '<bcf:citekey order="1">lamport94</bcf:citekey>',
    '<bcf:citekey order="2">knuth84</bcf:citekey>',
  ].join('\n')

  it('emits only the .bcf-cited entries, nty-sorted', () => {
    const entries = parseBibFile(bib, 'refs.bib')
    const bbl = generateBiblatexBbl({
      entries,
      citedKeys: parseBcfCitedKeys(bcf),
      sort: detectBiblatexSort('\\usepackage{biblatex}'),
    })
    expect(bbl).toContain('\\entry{knuth84}{book}{}{}')
    expect(bbl).toContain('\\entry{lamport94}{book}{}{}')
    expect(bbl).not.toContain('unused')
    // nty default: Knuth sorts before Lamport regardless of cite order in the .bcf.
    expect(bbl.indexOf('knuth84')).toBeLessThan(bbl.indexOf('lamport94'))
  })
})

describe('generateBiblatexBbl', () => {
  const entries = [
    entry({
      key: 'knuth84',
      type: 'book',
      author: 'Knuth, Donald',
      title: 'Literate Programming',
      year: '1984',
    }),
    entry({
      key: 'lamport94',
      type: 'book',
      author: 'Lamport, Leslie',
      title: 'LaTeX',
      year: '1994',
    }),
    entry({ key: 'unused', title: 'Never cited' }),
  ]

  it('includes only cited entries', () => {
    const bbl = generateBiblatexBbl({ entries, citedKeys: ['knuth84'] })
    expect(bbl).toContain('\\entry{knuth84}{book}{}{}')
    expect(bbl).not.toContain('unused')
    expect(bbl).toContain('\\begin{refsection}')
    expect(bbl).toContain('\\enddatalist')
  })

  it('emits core fields and a name block', () => {
    const bbl = generateBiblatexBbl({ entries, citedKeys: ['knuth84'] })
    expect(bbl).toContain('\\field{title}{Literate Programming}')
    expect(bbl).toContain('\\field{year}{1984}')
    expect(bbl).toContain('family={Knuth}')
    expect(bbl).toContain('given={Donald}')
  })

  it('sorts by name/title/year (nty) by default', () => {
    const bbl = generateBiblatexBbl({ entries, citedKeys: ['lamport94', 'knuth84'] })
    // Knuth sorts before Lamport regardless of cite order.
    expect(bbl.indexOf('knuth84')).toBeLessThan(bbl.indexOf('lamport94'))
  })

  it('preserves cite order when sort is none', () => {
    const bbl = generateBiblatexBbl({ entries, citedKeys: ['lamport94', 'knuth84'], sort: 'none' })
    expect(bbl.indexOf('lamport94')).toBeLessThan(bbl.indexOf('knuth84'))
  })

  it('emits each entry once even if cited repeatedly', () => {
    const bbl = generateBiblatexBbl({ entries, citedKeys: ['knuth84', 'knuth84', 'knuth84'] })
    expect(bbl.match(/\\entry\{knuth84\}/g)).toHaveLength(1)
  })

  it('strips stray braces from values so groups stay balanced', () => {
    const bbl = generateBiblatexBbl({
      entries: [entry({ key: 'a', title: 'A } broken { brace' })],
      citedKeys: ['a'],
    })
    expect(bbl).toContain('\\field{title}{A  broken  brace}')
  })

  it('escapes hard-error specials (& % #) so the .bbl compiles', () => {
    const bbl = generateBiblatexBbl({
      entries: [entry({ key: 'a', title: 'Cats & Dogs 100% #1', author: 'Smith & Jones' })],
      citedKeys: ['a'],
    })
    expect(bbl).toContain('\\field{title}{Cats \\& Dogs 100\\% \\#1}')
    // a raw, un-escaped & must never reach the field value (would be a fatal alignment-tab error)
    expect(bbl).not.toMatch(/\{[^{}]*[^\\]&/)
    // escaping also applies to name fields ("Smith & Jones" → given="Smith &", family="Jones")
    expect(bbl).toContain('given={Smith \\&}')
  })

  it('does not double-escape already-escaped specials or mangle commands/math', () => {
    const bbl = generateBiblatexBbl({
      entries: [entry({ key: 'a', title: 'Already \\& safe, $x^2$, Schr\\"oder' })],
      citedKeys: ['a'],
    })
    // \& stays \& (not \textbackslash&), math/accent commands pass through untouched
    expect(bbl).toContain('\\field{title}{Already \\& safe, $x^2$, Schr\\"oder}')
  })

  it('preserves balanced brace-delimited commands (\\emph{…}, \\textbf{…})', () => {
    // Unconditionally stripping all braces fused `\emph{Hard}` into `\emphHard`, an
    // undefined control sequence that hard-errors biblatex. Only UNBALANCED braces should go.
    const bbl = generateBiblatexBbl({
      entries: [entry({ key: 'a', title: 'The \\emph{Hard} \\textbf{Problem}' })],
      citedKeys: ['a'],
    })
    expect(bbl).toContain('\\field{title}{The \\emph{Hard} \\textbf{Problem}}')
  })

  it('preserves escaped literal braces (\\{ \\}) instead of treating them as grouping braces', () => {
    // `\{` / `\}` are literal-brace control sequences, not group delimiters. Counting them
    // as grouping braces drops a real one: a lone `\{` looks "unmatched" and is removed
    // (leaving a dangling backslash), and inside `\emph{a \{ b}` the escaped `\{` pairs
    // against the group's `}`, so `\emph`'s real `{` is reported unmatched and dropped —
    // yielding the undefined control sequence `\empha`.
    const lone = generateBiblatexBbl({
      entries: [entry({ key: 'a', title: 'Using \\{ as delimiter' })],
      citedKeys: ['a'],
    })
    expect(lone).toContain('\\field{title}{Using \\{ as delimiter}')

    const inGroup = generateBiblatexBbl({
      entries: [entry({ key: 'b', title: 'The \\emph{a \\{ b}' })],
      citedKeys: ['b'],
    })
    expect(inGroup).toContain('\\field{title}{The \\emph{a \\{ b}}')
  })

  it('escapes a special after an even backslash run (\\\\& is a live ampersand)', () => {
    // In TeX `\\&` is an escaped backslash followed by an UNescaped `&` — it must be
    // escaped, otherwise the raw `&` is a fatal alignment-tab and a raw `%` silently
    // comments out the rest of the field. (`\&`, an odd run, stays untouched.)
    const bbl = generateBiblatexBbl({
      entries: [entry({ key: 'a', title: 'A \\\\& B, x \\\\% y' })],
      citedKeys: ['a'],
    })
    expect(bbl).toContain('\\field{title}{A \\\\\\& B, x \\\\\\% y}')
    // an odd backslash run (a user's `\&`) is still NOT double-escaped
    const odd = generateBiblatexBbl({
      entries: [entry({ key: 'b', title: 'Keep \\& as-is' })],
      citedKeys: ['b'],
    })
    expect(odd).toContain('\\field{title}{Keep \\& as-is}')
  })

  it('orders entries deterministically regardless of host locale', () => {
    // `localeCompare` collates accented chars per the host's default locale (e.g. under sv,
    // `å` sorts after `z`), making the .bbl byte order host-dependent and breaking the
    // content-addressed cross-host parity contract. A code-point comparator is stable.
    const bbl = generateBiblatexBbl({
      entries: [
        entry({ key: 'angstrom', author: 'Ångström, Anders', title: 'A', year: '2000' }),
        entry({ key: 'ziegler', author: 'Ziegler, Zoe', title: 'Z', year: '2001' }),
      ],
      citedKeys: ['angstrom', 'ziegler'],
    })
    // lowercase 'å' (U+00E5) > 'z' (U+007A), so code-point order puts ziegler first on
    // every host; under en-US locale collation angstrom would (wrongly) sort first.
    expect(bbl.indexOf('ziegler')).toBeLessThan(bbl.indexOf('angstrom'))
  })
})

describe('selectBiblatexBackend', () => {
  const fake: BibliographyBackend = { id: 'biber-wasm', generateBbl: () => '' }

  it('falls back to the bundled biblatex-lite backend', () => {
    expect(selectBiblatexBackend()).toBe(biblatexLiteBackend)
  })
  it('prefers a registered backend by id', () => {
    expect(selectBiblatexBackend([fake], 'biber-wasm')).toBe(fake)
  })
  it('uses the first registered backend when no preference matches', () => {
    expect(selectBiblatexBackend([fake], 'nope')).toBe(fake)
  })
})

describe('resolveBstFile', () => {
  const readFrom = (fs: VirtualFS) => (p: string) => {
    const c = fs.readFile(p)
    return typeof c === 'string' ? c : null
  }

  it('resolves a project-local custom style named by \\bibstyle', () => {
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('mycustom.bst', 'ENTRY {} {} {}')
    expect(resolveBstFile('\\bibstyle{mycustom}', readFrom(fs))).toEqual({
      path: 'mycustom.bst',
      content: 'ENTRY {} {} {}',
    })
  })

  it('does not double-suffix a style already ending in .bst', () => {
    const fs = new VirtualFS({ empty: true })
    fs.writeFile('mycustom.bst', 'S')
    expect(resolveBstFile('\\bibstyle{mycustom.bst}', readFrom(fs))?.path).toBe('mycustom.bst')
  })

  it('returns null for a bundled style with no project file', () => {
    expect(resolveBstFile('\\bibstyle{plain}', () => null)).toBeNull()
  })

  it('returns null when the aux has no \\bibstyle', () => {
    expect(resolveBstFile('\\citation{x}\\bibdata{refs}', () => 'x')).toBeNull()
  })
})

describe('runRemoteBibliography', () => {
  const req: BibliographyStageRequest = {
    aux: '\\citation{x}\\bibdata{refs}',
    bibFiles: { 'refs.bib': '@book{x, title={T}}' },
  }
  const clientBackend = (): ToolBackend<BibliographyStageRequest, string, typeof BIBTEX_STAGE> => ({
    id: 'client-bibtex',
    stage: BIBTEX_STAGE,
    location: 'client',
    run: async () => 'CLIENT',
  })
  const serverBackend = (
    run: () => Promise<string>,
  ): ToolBackend<BibliographyStageRequest, string, typeof BIBTEX_STAGE> => ({
    id: 'remote-bibtex',
    stage: BIBTEX_STAGE,
    location: 'server',
    run,
  })

  it('returns null with no registry — the client BibTeX default stays intact', async () => {
    expect(await runRemoteBibliography(undefined, req)).toBeNull()
  })

  it('returns null when the resolved backend runs on the client (no offload)', async () => {
    const reg = new BackendRegistry({ [BIBTEX_STAGE]: clientBackend() })
    expect(await runRemoteBibliography(reg, req)).toBeNull()
  })

  it('runs a registered server backend and returns its .bbl', async () => {
    const reg = new BackendRegistry()
    reg.register(
      BIBTEX_STAGE,
      serverBackend(async () => 'REMOTE-BBL'),
    )
    expect(await runRemoteBibliography(reg, req)).toBe('REMOTE-BBL')
  })

  it('never dispatches a classic BibTeX request to a Biber backend', async () => {
    let seen: BiberRequest | null = null
    const biberBackend: ToolBackend<BiberRequest, string, typeof BIBER_STAGE> = {
      id: 'biber',
      stage: BIBER_STAGE,
      location: 'server',
      async run(request) {
        seen = request
        return 'BIBER-BBL'
      },
    }
    const reg = new BackendRegistry()
    reg.register(BIBER_STAGE, biberBackend)

    expect(await runRemoteBibliography(reg, req)).toBeNull()
    expect(seen).toBeNull()
    expect(
      await runRemoteBiber(reg, {
        bcf: '<bcf:controlfile/>',
        bibFiles: req.bibFiles,
      }),
    ).toBe('BIBER-BBL')
  })

  it('a content-cached server backend runs once for identical requests (compile once, instant everywhere)', async () => {
    let calls = 0
    const reg = new BackendRegistry()
    const cached = withCache(
      serverBackend(async () => {
        calls++
        return 'BBL'
      }),
      new MemoryCacheStore(),
      (r) => r.aux,
    )
    reg.register(BIBTEX_STAGE, cached)
    expect(await runRemoteBibliography(reg, req)).toBe('BBL')
    expect(await runRemoteBibliography(reg, req)).toBe('BBL')
    expect(calls).toBe(1)
  })
})
