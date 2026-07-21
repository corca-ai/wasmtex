import { describe, expect, it } from 'vitest'
import { type BibFileReader, formatReference, parseBibFile, rebuildBibIndex } from '../bib-parser'
import { ProjectIndex } from '../project-index'

function parse(src: string) {
  return parseBibFile(src, 'refs.bib')
}

/** Minimal in-memory file source over a path→content map. */
function reader(files: Record<string, string>): BibFileReader & { remove(path: string): void } {
  const map = new Map(Object.entries(files))
  return {
    listFiles: () => [...map.keys()],
    readFile: (path) => map.get(path) ?? null,
    remove: (path) => map.delete(path),
  }
}

describe('parseBibFile', () => {
  it('parses a basic entry with type, key, and location', () => {
    const [e] = parse('@article{knuth84,\n  title = {Literate Programming},\n  year = {1984}\n}')
    expect(e!.type).toBe('article')
    expect(e!.key).toBe('knuth84')
    expect(e!.title).toBe('Literate Programming')
    expect(e!.year).toBe('1984')
    expect(e!.location).toEqual({ file: 'refs.bib', line: 1, column: 10 })
  })

  it('handles nested braces in a value', () => {
    const [e] = parse('@book{c, title = {The {LaTeX} Companion {2e}}}')
    expect(e!.title).toBe('The LaTeX Companion 2e')
  })

  it('handles quote-delimited values', () => {
    const [e] = parse('@article{a, author = "Knuth, Donald", title = "TeX"}')
    expect(e!.author).toBe('Knuth, Donald')
    expect(e!.title).toBe('TeX')
  })

  it('handles quotes containing braces', () => {
    const [e] = parse('@article{a, title = "A {Study} of \\"quotes\\""}')
    expect(e!.title).toContain('Study')
  })

  it('closes a quoted value at the real " even with an unbalanced inner {', () => {
    // A stray `{` inside a quote value used to push depth>0, so the closing `"` (which
    // only matched at depth 0) was ignored and the scanner ran on, swallowing the
    // following fields and the next entry. The quote must close regardless of brace depth.
    const entries = parse('@article{k, title = "A {brace", year = "2020"}\n@book{b, title={ok}}')
    expect(entries).toHaveLength(2)
    expect(entries[0]!.key).toBe('k')
    expect(entries[0]!.year).toBe('2020')
    expect(entries[0]!.title).not.toContain('@book')
    expect(entries.some((e) => e.key === 'b')).toBe(true)
  })

  it('does not truncate a quoted value at a \\" umlaut accent', () => {
    // `"Schr\"odinger"` — the `\"` is an o-umlaut accent, not a closing quote.
    // A naive scanner stops at the `"` after the backslash and returns `Schr\`.
    const [e] = parse('@article{a, author = "Schr\\"odinger", year = "1926"}')
    expect(e!.author).toContain('odinger')
    expect(e!.year).toBe('1926')
  })

  it('does not miscount an escaped \\} brace inside a braced value', () => {
    // `{a \} b}` contains a literal close-brace. Counting it as a real `}` closes the
    // value (and terminates the whole entry) early, silently dropping later fields.
    const [e] = parse('@misc{a, title = {a \\} b}, year = {2020}}')
    expect(e).toBeDefined()
    expect(e!.year).toBe('2020')
  })

  it('expands @string macros', () => {
    const [e] = parse('@string{tug = {TUGboat}}\n@article{a, journal = tug}')
    expect(e!.journal).toBe('TUGboat')
  })

  it('concatenates values with #', () => {
    const [e] = parse('@string{n = {Vol. }}\n@article{a, title = n # 3 # " of " # "TUG"}')
    expect(e!.title).toBe('Vol. 3 of TUG')
  })

  it('resolves crossref field inheritance', () => {
    const src = [
      '@proceedings{proc, title = {Proc TUG}, year = {2020}, publisher = {TUG}}',
      '@inproceedings{paper, title = {My Paper}, crossref = {proc}}',
    ].join('\n')
    const paper = parse(src).find((e) => e.key === 'paper')!
    expect(paper.year).toBe('2020') // inherited
    expect(paper.title).toBe('My Paper') // own field wins
    expect(paper.journal).toBe('TUG') // publisher inherited as venue
  })

  it('handles multi-line values', () => {
    const [e] = parse('@article{a,\n  title = {A very\n   long\n   title}\n}')
    expect(e!.title).toBe('A very long title')
  })

  it('skips @preamble and @comment', () => {
    const entries = parse(
      '@comment{ignore me}\n@preamble{"\\newcommand{x}"}\n@book{real, title={R}}',
    )
    expect(entries.map((e) => e.key)).toEqual(['real'])
  })

  it('supports parenthesis-delimited entries', () => {
    const [e] = parse('@article(a, title = {Paren})')
    expect(e!.key).toBe('a')
    expect(e!.title).toBe('Paren')
  })

  it('parses multiple entries and exposes all fields', () => {
    const entries = parse('@article{a, title={A}}\n@book{b, author={B}, isbn={123}}')
    expect(entries).toHaveLength(2)
    expect(entries[1]!.fields?.isbn).toBe('123')
  })

  it('uses booktitle as the venue when journal is absent', () => {
    const [e] = parse('@inproceedings{a, booktitle = {Proc. of X}}')
    expect(e!.journal).toBe('Proc. of X')
  })

  it('never throws on malformed input', () => {
    expect(() => parse('@article{broken, title = {unclosed')).not.toThrow()
    expect(() => parse('@@@ {{{ not bibtex')).not.toThrow()
    expect(() => parse('@article{}')).not.toThrow()
  })
})

describe('formatReference', () => {
  it('renders author, year, title, and venue', () => {
    const [e] = parse('@article{a, author={Knuth}, year={1984}, title={TeX}, journal={TUGboat}}')
    expect(formatReference(e!)).toBe('Knuth (1984). *TeX*. TUGboat')
  })

  it('degrades gracefully with only a title', () => {
    const [e] = parse('@misc{a, title={Just a title}}')
    expect(formatReference(e!)).toBe('*Just a title*')
  })
})

describe('rebuildBibIndex', () => {
  it('loads entries from every .bib file in the source', () => {
    const index = new ProjectIndex()
    rebuildBibIndex(
      reader({ 'refs.bib': '@article{foo,title={F}}', 'more.bib': '@book{bar}' }),
      index,
    )
    expect(
      index
        .getBibEntries()
        .map((e) => e.key)
        .sort(),
    ).toEqual(['bar', 'foo'])
  })

  it('drops entries of a removed .bib file when rebuilt (the deleteFile staleness case)', () => {
    // Mirrors WasmTex.deleteFile / setFile: after a .bib leaves the file set, a rebuild must
    // re-derive the index from the *current* files so deleted entries do not linger.
    const src = reader({ 'refs.bib': '@article{foo,title={F}}', 'more.bib': '@book{bar}' })
    const index = new ProjectIndex()
    rebuildBibIndex(src, index)
    expect(index.findBibEntry('foo')).toBeDefined()

    src.remove('refs.bib')
    rebuildBibIndex(src, index)

    expect(index.findBibEntry('foo')).toBeUndefined()
    expect(index.findBibEntry('bar')).toBeDefined()
  })
})
