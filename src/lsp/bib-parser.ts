import type { ProjectIndex } from './project-index'
import { buildLineStarts, offsetToLineCol } from './source-position'
import type { BibEntry, BibStringDef, ParsedBibFile } from './types'

/** Minimal file source: enough of a VirtualFS to find and read `.bib` files. */
export interface BibFileReader {
  listFiles(): string[]
  readFile(path: string): string | Uint8Array | null
}

/** Re-parse every `.bib` file in `fs` and load the entries into `index`. Shared by
 *  the headless core and the standalone language service so the wiring lives once. */
export function rebuildBibIndex(fs: BibFileReader, index: ProjectIndex): void {
  const files = new Map<string, ParsedBibFile>()
  for (const path of fs.listFiles()) {
    if (!path.endsWith('.bib')) continue
    const content = fs.readFile(path)
    if (typeof content === 'string') files.set(path, parseBibFileData(content, path))
  }
  index.replaceBibFiles(files)
}

/**
 * Robust BibTeX/biblatex `.bib` parser.
 *
 * Handles all entry types, brace- and quote-delimited values with nested
 * braces, multi-line values, `#` string concatenation, `@string` macro
 * expansion, `@preamble`/`@comment`, and `crossref`/`xdata` field inheritance.
 * Never throws — malformed input is skipped, returning a best-effort entry list.
 */

interface RawEntry {
  type: string
  key: string
  keyOffset: number
  fields: Record<string, string>
}

interface RawString {
  name: string
  value: string
  nameOffset: number
}

const isLetter = (ch: string): boolean => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
/** Whitespace test with an ASCII fast path; falls back to `\s` for rare non-ASCII so the
 *  behavior matches the regex it replaces. Hot: called per char while skipping whitespace. */
const isWs = (ch: string): boolean =>
  ch === ' ' ||
  ch === '\t' ||
  ch === '\n' ||
  ch === '\r' ||
  ch === '\f' ||
  ch === '\v' ||
  (ch > '\x7f' && /\s/.test(ch))
const isNameChar = (ch: string): boolean =>
  isLetter(ch) || (ch >= '0' && ch <= '9') || ch === '_' || ch === '-' || ch === ':' || ch === '.'

class BibScanner {
  private pos = 0
  private strings = new Map<string, string>()
  private stringDefinitions: RawString[] = []
  private entries: RawEntry[] = []

  constructor(private src: string) {}

  parse(): RawEntry[] {
    while (this.pos < this.src.length) {
      if (!this.skipToAt()) break
      this.readEntryOrCommand()
    }
    return this.entries
  }

  getStrings(): RawString[] {
    return this.stringDefinitions
  }

  /** Advance to the next `@`; returns false at end of input. */
  private skipToAt(): boolean {
    while (this.pos < this.src.length && this.src[this.pos] !== '@') this.pos++
    return this.pos < this.src.length
  }

  private skipWs(): void {
    while (this.pos < this.src.length && isWs(this.src[this.pos]!)) this.pos++
  }

  private readName(): string {
    const start = this.pos
    while (this.pos < this.src.length && isNameChar(this.src[this.pos]!)) this.pos++
    return this.src.slice(start, this.pos)
  }

  private readEntryOrCommand(): void {
    this.pos++ // consume '@'
    const type = this.readName().toLowerCase()
    this.skipWs()
    const open = this.src[this.pos]
    if (open !== '{' && open !== '(') return // not a real entry; resume scanning
    const close = open === '{' ? '}' : ')'
    this.pos++ // consume opener

    if (type === 'string') this.readString()
    else if (type === 'preamble' || type === 'comment') this.skipBalanced()
    else this.readEntry(type, close)
  }

  private readString(): void {
    this.skipWs()
    const nameOffset = this.pos
    const name = this.readName().toLowerCase()
    this.skipWs()
    if (this.src[this.pos] === '=') {
      this.pos++
      const value = this.readValue()
      this.strings.set(name, value)
      if (name) this.stringDefinitions.push({ name, value, nameOffset })
    }
    this.skipBalanced()
  }

  private readEntry(type: string, close: string): void {
    this.skipWs()
    const keyOffset = this.pos
    const key = this.readUntil([',', close])
    const entry: RawEntry = { type, key: key.trim(), keyOffset, fields: {} }
    if (this.src[this.pos] === ',') this.pos++
    this.readFields(entry, close)
    if (entry.key) this.entries.push(entry)
  }

  private readFields(entry: RawEntry, close: string): void {
    while (this.pos < this.src.length) {
      this.skipWs()
      if (this.src[this.pos] === close || this.pos >= this.src.length) {
        this.pos++ // consume close
        return
      }
      const name = this.readName().toLowerCase()
      this.skipWs()
      if (this.src[this.pos] === '=') {
        this.pos++
        entry.fields[name] = this.readValue()
      } else if (!name) {
        this.pos++ // stray char — advance to avoid an infinite loop
      }
      this.skipWs()
      if (this.src[this.pos] === ',') this.pos++
    }
  }

  /** Read a field value: `#`-concatenated parts (braces, quotes, or macro/number). */
  private readValue(): string {
    const parts: string[] = []
    for (;;) {
      this.skipWs()
      const ch = this.src[this.pos]
      if (ch === '{' || ch === '"') parts.push(this.readDelimited())
      else if (ch !== undefined && isNameChar(ch)) parts.push(this.readBareValue())
      else break
      this.skipWs()
      if (this.src[this.pos] === '#') this.pos++
      else break
    }
    return parts.join('')
  }

  /** Read a `{…}`- or `"…"`-delimited value (pos at the opener). A backslash escapes the
   *  next char — so a literal `\{`/`\}` or a `\"` umlaut accent doesn't shift brace depth or
   *  close the value. Inner braces nest in both forms; a quote closes only at brace depth 0. */
  private readDelimited(): string {
    const closer = this.src[this.pos] === '{' ? '}' : '"'
    const innerStart = this.pos + 1
    this.pos++ // consume the opener
    let depth = closer === '}' ? 1 : 0
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]!
      if (ch === '\\') {
        this.pos += 2 // backslash escapes the next char
        continue
      }
      if (ch === '{') depth++
      else if (ch === '}' && depth > 0) depth--
      // A `}`-delimited value closes only at depth 0; a `"`-delimited value has no
      // structural need for brace balance, so an unbalanced inner `{` must not prevent its
      // closing `"` from terminating it (else it swallows the following fields/entries).
      if (ch === closer && (closer === '"' || depth === 0)) break
      this.pos++
    }
    const value = this.src.slice(innerStart, this.pos)
    if (this.pos < this.src.length) this.pos++ // consume the closer
    return value
  }

  /** A bare token: a `@string` macro reference (expanded) or a literal number. */
  private readBareValue(): string {
    const token = this.readName()
    return this.strings.get(token.toLowerCase()) ?? token
  }

  private readUntil(stops: string[]): string {
    const start = this.pos
    while (this.pos < this.src.length && !stops.includes(this.src[this.pos]!)) this.pos++
    return this.src.slice(start, this.pos)
  }

  /** Skip to the end of the current entry group (opener already consumed). */
  private skipBalanced(): void {
    let depth = 1
    while (this.pos < this.src.length && depth > 0) {
      const ch = this.src[this.pos]!
      if (ch === '{' || ch === '(') depth++
      else if (ch === '}' || ch === ')') depth--
      this.pos++
    }
  }
}

/** Inherit fields from `crossref`/`xdata` parents that the entry doesn't define. */
function resolveInheritance(entries: RawEntry[]): void {
  const byKey = new Map(entries.map((e) => [e.key.toLowerCase(), e]))
  const lookup = (key: string | undefined): RawEntry | undefined =>
    key ? byKey.get(key.toLowerCase()) : undefined
  for (const entry of entries) {
    inheritFields(entry, lookup(entry.fields.crossref))
    inheritFields(entry, lookup(entry.fields.xdata))
  }
}

function inheritFields(entry: RawEntry, parent: RawEntry | undefined): void {
  if (!parent) return
  for (const [name, value] of Object.entries(parent.fields)) {
    if (!(name in entry.fields)) entry.fields[name] = value
  }
}

/** Strip braces and collapse whitespace for display. */
function cleanValue(value: string): string {
  return value.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim()
}

export function parseBibFileData(content: string, filePath: string): ParsedBibFile {
  const scanner = new BibScanner(content)
  const raw = scanner.parse()
  resolveInheritance(raw)
  const lineStarts = buildLineStarts(content)

  const entries = raw
    .filter((e) => e.type !== 'string' && e.type !== 'preamble' && e.type !== 'comment')
    .map((e) => {
      const { line, column } = offsetToLineCol(lineStarts, e.keyOffset)
      const fields: Record<string, string> = {}
      for (const [name, value] of Object.entries(e.fields)) fields[name] = cleanValue(value)
      const entry: BibEntry = {
        key: e.key,
        type: e.type,
        location: { file: filePath, line, column },
        fields,
      }
      if (fields.title) entry.title = fields.title
      if (fields.author) entry.author = fields.author
      if (fields.year) entry.year = fields.year
      const venue = fields.journal ?? fields.booktitle ?? fields.publisher
      if (venue) entry.journal = venue
      return entry
    })
  const strings: BibStringDef[] = scanner.getStrings().map((definition) => {
    const { line, column } = offsetToLineCol(lineStarts, definition.nameOffset)
    return {
      name: definition.name,
      value: cleanValue(definition.value),
      location: { file: filePath, line, column },
    }
  })
  return { entries, strings }
}

export function parseBibFile(content: string, filePath: string): BibEntry[] {
  return parseBibFileData(content, filePath).entries
}

/** Render a formatted reference preview (author, year, title, venue) for hover. */
export function formatReference(entry: BibEntry): string {
  const head = [entry.author, entry.year ? `(${entry.year})` : ''].filter(Boolean).join(' ')
  const lines: string[] = []
  if (head) lines.push(head)
  if (entry.title) lines.push(`*${entry.title}*`)
  if (entry.journal) lines.push(entry.journal)
  return lines.join('. ')
}
