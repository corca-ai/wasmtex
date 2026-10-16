import { readBalancedGroup } from '../lsp/balanced-group'
import { macroDefinitionSpansFromTokens, maskSpansFromTokens } from '../lsp/latex-parser'
import { CITE_CMDS, REF_CMDS } from '../lsp/latex-patterns'
import { type Token, tokenize } from '../lsp/latex-tokenizer'
import { buildLineStarts } from '../lsp/source-position'
import type { LatexFileSyntax } from '../syntax'
import {
  assertLatexSyntaxSchemaVersion,
  type LatexSyntaxBlock,
  type LatexSyntaxRange,
} from '../syntax-contract'
import { VisibleSourceRanges } from './visible-source-ranges'
import {
  type NormalizedVisibleText,
  normalizeVisibleText,
  type VisibleTextUnit,
} from './visible-text-normalize'

export interface VisibleTextSourceBlock extends NormalizedVisibleText {
  kind: LatexSyntaxBlock['kind'] | 'metadata' | 'footnote'
  name?: string
  /** The containing neutral syntax block, not an automatic-edit range. */
  structuralRange: LatexSyntaxRange
}

export interface VisibleTextSourceProjection {
  fileId: string
  file: string
  documentVersion: number
  sourceLength: number
  lineStarts: Uint32Array
  blocks: readonly VisibleTextSourceBlock[]
  truncated: boolean
}

interface ProseDomain {
  kind: VisibleTextSourceBlock['kind']
  name?: string
  range: LatexSyntaxRange
  structuralRange: LatexSyntaxRange
  metadata: boolean
}

const HIDDEN_ARGUMENTS = new Set([
  ...CITE_CMDS.split('|'),
  ...REF_CMDS.split('|'),
  'label',
  'includegraphics',
  'begin',
  'end',
  'documentclass',
  'usepackage',
  'RequirePackage',
  'DocumentMetadata',
])

const FIELD_COMMANDS = new Set(['title', 'author', 'date', 'subtitle', 'institute', 'keywords'])
const HEADING_COMMANDS = new Set([
  'part',
  'chapter',
  'section',
  'subsection',
  'subsubsection',
  'paragraph',
  'subparagraph',
])
const NOTE_COMMANDS = new Set(['footnote', 'footnotetext', 'thanks'])
const PROSE_WRAPPERS = new Set([
  'textbf',
  'textit',
  'emph',
  'textnormal',
  'textrm',
  'textsf',
  'texttt',
  'textsc',
  'textmd',
  'textup',
  'mbox',
  'underline',
])
const PROSE_SWITCHES = new Set([
  'bfseries',
  'itshape',
  'normalfont',
  'small',
  'large',
  'Large',
  'LARGE',
  'huge',
  'Huge',
  'footnotesize',
  'scriptsize',
  'tiny',
  'centering',
  'raggedright',
  'noindent',
  'maketitle',
  'titlepage',
  'newpage',
  'clearpage',
  'cleardoublepage',
  'leavevmode',
  'protect',
  'relax',
])
const SPACES = new Set([
  '\\',
  'newline',
  'and',
  'linebreak',
  'par',
  'space',
  'quad',
  'qquad',
  'enspace',
  ',',
  ';',
  ':',
  ' ',
])
const SYMBOLS = new Map([
  ['&', '&'],
  ['%', '%'],
  ['$', '$'],
  ['#', '#'],
  ['_', '_'],
  ['{', '{'],
  ['}', '}'],
  ['textbackslash', '\\'],
  ['textasciicircum', '^'],
  ['textasciitilde', '~'],
  ['ae', 'æ'],
  ['AE', 'Æ'],
  ['oe', 'œ'],
  ['OE', 'Œ'],
  ['ss', 'ß'],
])

function firstRequired(source: string, token: Token) {
  let offset = token.end + Number(source[token.end] === '*')
  for (let count = 0; count < 8; count++) {
    while (/\s/.test(source[offset] ?? '')) offset++
    if (!['[', '{'].includes(source[offset] ?? '')) return null
    const group = readBalancedGroup(source, offset, true)
    if (!group.closed) return null
    if (source[offset] === '{')
      return { startOffset: offset + 1, endOffset: group.contentEnd, invocationEnd: group.end }
    offset = group.end
  }
  return null
}

function extraKind(name: string): ProseDomain['kind'] | null {
  if (FIELD_COMMANDS.has(name)) return 'metadata'
  if (HEADING_COMMANDS.has(name)) return 'heading'
  if (NOTE_COMMANDS.has(name)) return 'footnote'
  return name === 'caption' ? 'caption' : null
}

function trailingGroupsEnd(source: string, offset: number) {
  let end = offset
  for (let count = 0; count < 8; count++) {
    let next = end
    while (/\s/.test(source[next] ?? '')) next++
    if (source[next] !== '{') break
    const group = readBalancedGroup(source, next, true)
    if (!group.closed) break
    end = group.end
  }
  return end
}

function opaqueArguments(
  source: string,
  tokens: readonly Token[],
  overridden: ReadonlySet<string>,
  masked: VisibleSourceRanges,
) {
  const ranges: LatexSyntaxRange[] = []
  const parents = enclosingEnds(tokens)
  for (const token of tokens) {
    if (token.type !== 'command' || masked.intersects(token.start, token.end)) continue
    if (
      !overridden.has(token.value) &&
      (extraKind(token.value) ||
        PROSE_WRAPPERS.has(token.value) ||
        PROSE_SWITCHES.has(token.value) ||
        SPACES.has(token.value) ||
        SYMBOLS.has(token.value))
    )
      continue
    const value = firstRequired(source, token)
    const paragraphEnd = source.indexOf('\n\n', token.end)
    const end =
      value && HIDDEN_ARGUMENTS.has(token.value) && !overridden.has(token.value)
        ? trailingGroupsEnd(source, value.invocationEnd)
        : (parents.get(token.start) ?? (paragraphEnd === -1 ? source.length : paragraphEnd))
    ranges.push({ startOffset: token.end, endOffset: end })
  }
  return new VisibleSourceRanges(ranges)
}

function extraDomains(
  source: string,
  syntax: LatexFileSyntax,
  tokens: readonly Token[],
  overridden: ReadonlySet<string>,
  masked: VisibleSourceRanges,
) {
  const opaque = opaqueArguments(source, tokens, overridden, masked)
  const annotations = new Map(
    syntax.proseAnnotations
      .filter((item) => item.kind === 'document-field' && item.state === 'complete')
      .map((item) => [item.range.startOffset, item]),
  )
  return tokens.flatMap((token): ProseDomain[] => {
    if (
      token.type !== 'command' ||
      overridden.has(token.value) ||
      opaque.intersects(token.start, token.end)
    )
      return []
    const kind = extraKind(token.value)
    if (!kind) return []
    const value = firstRequired(source, token)
    if (!value) return []
    const annotation = annotations.get(token.start)
    const range =
      annotation?.kind === 'document-field' && annotation.valueRange ? annotation.valueRange : value
    return [
      {
        kind,
        name: token.value,
        range,
        structuralRange: { startOffset: token.start, endOffset: value.invocationEnd },
        metadata: true,
      },
    ]
  })
}

function enclosingEnds(tokens: readonly Token[]) {
  const stack: number[] = []
  const parents = new Map<number, number>()
  const ends = new Map<number, number>()
  for (const token of tokens) {
    if (token.type === 'open') stack.push(token.start)
    else if (token.type === 'close') {
      const open = stack.pop()
      if (open !== undefined) ends.set(open, token.end)
    } else if (token.type === 'command' && stack.length) parents.set(token.start, stack.at(-1)!)
  }
  return new Map([...parents].map(([command, open]) => [command, ends.get(open)]))
}

function firstToken(tokens: readonly Token[], offset: number) {
  let low = 0
  let high = tokens.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (tokens[middle]!.end <= offset) low = middle + 1
    else high = middle
  }
  return low
}

class SourceProseProjection {
  readonly blocks: VisibleTextSourceBlock[] = []
  private units: VisibleTextUnit[] = []
  private readonly visible: VisibleSourceRanges
  private readonly masked: VisibleSourceRanges
  private readonly parents: ReturnType<typeof enclosingEnds>
  readonly extras: ProseDomain[]

  constructor(
    private source: string,
    syntax: LatexFileSyntax,
    private tokens: Token[],
    private overridden: ReadonlySet<string>,
  ) {
    this.visible = new VisibleSourceRanges(syntax.visibleProse.map(({ range }) => range))
    this.masked = new VisibleSourceRanges(
      [...maskSpansFromTokens(tokens), ...macroDefinitionSpansFromTokens(source, tokens)]
        .map(([startOffset, endOffset]) => ({ startOffset, endOffset }))
        .concat(syntax.mathRoots.map(({ fullRange }) => fullRange)),
    )
    this.parents = enclosingEnds(tokens)
    this.extras = extraDomains(source, syntax, tokens, overridden, this.masked)
  }

  project(domain: ProseDomain) {
    let skip = domain.range.startOffset
    const children = new VisibleSourceRanges(
      this.extras
        .filter(
          (extra) =>
            extra !== domain &&
            extra.range.startOffset >= domain.range.startOffset &&
            extra.range.endOffset <= domain.range.endOffset,
        )
        .map(({ structuralRange }) => structuralRange),
    )
    for (
      let index = firstToken(this.tokens, domain.range.startOffset);
      index < this.tokens.length;
      index++
    ) {
      const token = this.tokens[index]!
      if (token.start >= domain.range.endOffset) break
      if (token.end <= skip) continue
      if (
        this.masked.intersects(token.start, token.end) ||
        children.intersects(token.start, token.end)
      ) {
        this.flush(domain)
        continue
      }
      if (token.type === 'text')
        this.literal(
          domain,
          Math.max(skip, token.start),
          Math.min(token.end, domain.range.endOffset),
        )
      else if (token.type === 'command') skip = this.command(domain, token)
    }
    this.flush(domain)
  }

  private command(domain: ProseDomain, token: Token) {
    if (this.overridden.has(token.value)) return this.opaque(domain, token)
    if (HIDDEN_ARGUMENTS.has(token.value)) {
      this.flush(domain)
      return firstRequired(this.source, token)?.invocationEnd ?? this.opaque(domain, token)
    }
    const symbol = SYMBOLS.get(token.value)
    if (symbol !== undefined) {
      this.units.push({ text: symbol, start: token.start, end: token.end })
      return this.delimiterEnd(token)
    }
    if (SPACES.has(token.value)) {
      this.units.push({ text: ' ', start: token.start, end: token.end })
      return this.spacingEnd(token)
    }
    if (
      !this.overridden.has(token.value) &&
      (PROSE_WRAPPERS.has(token.value) || PROSE_SWITCHES.has(token.value))
    )
      return this.delimiterEnd(token)
    return this.opaque(domain, token)
  }

  private spacingEnd(token: Token) {
    const supportsStar = token.value === '\\'
    const supportsOptional = supportsStar || token.value === 'linebreak'
    if (!supportsOptional) return this.delimiterEnd(token)
    let start = this.whitespaceEnd(token.end)
    if (supportsStar && this.source[start] === '*') start = this.whitespaceEnd(start + 1)
    const optional = this.source[start] === '[' ? readBalancedGroup(this.source, start) : null
    return optional?.end ?? start
  }

  private delimiterEnd(token: Token) {
    return /^[A-Za-z]+$/.test(token.value) ? this.whitespaceEnd(token.end) : token.end
  }

  private whitespaceEnd(offset: number) {
    const whitespace = /^\s*/.exec(this.source.slice(offset))?.[0] ?? ''
    // A blank source line is a paragraph token, not a swallowed delimiter.
    return /\n[ \t\r]*\n/.test(whitespace) ? offset : offset + whitespace.length
  }

  private opaque(domain: ProseDomain, token: Token) {
    // Unknown grammars may consume unbraced arguments too. Keep the rest of
    // the containing source group/block opaque instead of guessing at output.
    this.flush(domain)
    return Math.min(this.parents.get(token.start) ?? domain.range.endOffset, domain.range.endOffset)
  }

  private literal(domain: ProseDomain, start: number, end: number) {
    const text = this.source.slice(start, end)
    const ranges =
      domain.metadata || /^\s*$/.test(text)
        ? [{ startOffset: start, endOffset: end }]
        : this.visible.clips(start, end)
    for (const range of ranges) {
      let left = range.startOffset
      let right = range.endOffset
      while (left > start && /\s/.test(this.source[left - 1]!)) left--
      while (right < end && /\s/.test(this.source[right]!)) right++
      this.literalUnits(left, right)
    }
  }

  private literalUnits(start: number, end: number) {
    const text = this.source.slice(start, end)
    const spellings: Record<string, string> = { '---': '—', '--': '–', '``': '“', "''": '”' }
    let previous = 0
    for (const match of text.matchAll(/---|--|``|''/g)) {
      this.units.push({
        text: text.slice(previous, match.index).replace(/[~&]/g, ' '),
        start: start + previous,
        end: start + match.index,
      })
      this.units.push({
        text: spellings[match[0]]!,
        start: start + match.index,
        end: start + match.index + match[0].length,
      })
      previous = match.index + match[0].length
    }
    this.units.push({
      text: text.slice(previous).replace(/[~&]/g, ' '),
      start: start + previous,
      end,
    })
  }

  private flush(domain: ProseDomain) {
    if (!this.units.length) return
    const normalized = normalizeVisibleText(this.units)
    this.units = []
    if (normalized.text)
      this.blocks.push({
        ...normalized,
        kind: domain.kind,
        ...(domain.name === undefined ? {} : { name: domain.name }),
        structuralRange: domain.structuralRange,
      })
  }
}

/** Consumes an existing syntax snapshot; never executes or expands TeX. */
export function projectVisibleTextSource(
  source: string,
  syntax: LatexFileSyntax,
  maxSourceUnits = 1_000_000,
): VisibleTextSourceProjection {
  assertLatexSyntaxSchemaVersion(syntax)
  const result: VisibleTextSourceProjection = {
    fileId: syntax.fileId,
    file: syntax.path,
    documentVersion: syntax.documentVersion,
    sourceLength: source.length,
    lineStarts: new Uint32Array(),
    blocks: [],
    truncated: source.length > maxSourceUnits,
  }
  if (result.truncated) return result
  result.lineStarts = Uint32Array.from(buildLineStarts(source))
  const tokens = tokenize(source)
  if (tokens.length > 100_000 || syntax.blocks.length > 4096) {
    result.truncated = true
    return result
  }
  const overridden = new Set(
    syntax.macros
      .filter((event) => event.kind === 'call' && event.definitions.length)
      .map(({ name }) => name),
  )
  const projection = new SourceProseProjection(source, syntax, tokens, overridden)
  if (projection.extras.length > 2048) {
    result.truncated = true
    return result
  }
  const ordinary = syntax.blocks
    .filter(
      (block) =>
        block.state === 'complete' &&
        !['heading', 'caption', 'display-math', 'resource-entry'].includes(block.kind),
    )
    .map(
      (block): ProseDomain => ({
        kind: block.kind,
        ...(block.name === undefined ? {} : { name: block.name }),
        range: block.contentRange ?? block.range,
        structuralRange: block.range,
        metadata: false,
      }),
    )
  for (const domain of [...ordinary, ...projection.extras].sort(
    (a, b) => a.range.startOffset - b.range.startOffset,
  ))
    projection.project(domain)
  result.blocks = projection.blocks
  return result
}
