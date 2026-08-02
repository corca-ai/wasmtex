/**
 * Parser-backed completion context analysis.
 *
 * The analyzer reads one command invocation around the cursor instead of adding a regex
 * for every syntax position. It is deliberately error-tolerant: an unfinished group is
 * treated as extending to the end of the document, and malformed input never throws.
 */
import { maskSpansFromTokens } from './latex-parser'
import { type Token, tokenize } from './latex-tokenizer'
import { type CommandArg, type CompletionValueKind, getCommandSignature } from './package-db'
import type { NeutralDocument, NeutralPosition, NeutralRange } from './protocol'
import { buildLineStarts, offsetToLineCol } from './source-position'

export type CompletionDomain = 'command' | CompletionValueKind

export interface CompletionCommandMetadataProvider {
  getCommandArguments(command: string): readonly CommandArg[] | undefined
}

interface CompletionContextBase {
  /** Project-relative path of the active document. */
  documentPath: string
  /** Prefix before the cursor used to filter candidates. */
  prefix: string
  /** Exact edit range, including a suffix after the cursor when present. */
  replacementRange: NeutralRange
  /** Resolver domain selected for this context. */
  domain: CompletionDomain
}

export interface CommandNameCompletionContext extends CompletionContextBase {
  type: 'command'
  domain: 'command'
}

export interface RelatedCompletionArgument {
  argumentIndex: number
  signatureIndex?: number
  valueKind: CompletionValueKind
  values: string[]
}

export interface CommandArgumentCompletionContext extends CompletionContextBase {
  type: 'argument'
  command: string
  starred: boolean
  /** Index among groups that are actually present in the invocation. */
  argumentIndex: number
  /** Index in the declared command signature, when the group matched one. */
  signatureIndex?: number
  delimiter: 'required' | 'optional'
  valueKind: CompletionValueKind
  list: boolean
  listIndex: number
  keyFamily?: string
  keyValuePosition?: 'key' | 'value'
  key?: string
  /** Keys used by sibling list items, excluding the item currently being edited. */
  usedKeys: string[]
  /** Semantic sibling arguments, including resource selectors after the cursor. */
  relatedArguments: RelatedCompletionArgument[]
  /** Resource argument selected by this argument's metadata, when present. */
  selector?: RelatedCompletionArgument
}

export type CompletionContext = CommandNameCompletionContext | CommandArgumentCompletionContext

interface ParsedGroup {
  delimiter: 'required' | 'optional'
  open: number
  contentStart: number
  contentEnd: number
  end: number
  closed: boolean
  argumentIndex: number
  signatureIndex?: number
  spec: CommandArg
}

interface ParsedInvocation {
  command: string
  starred: boolean
  groups: ParsedGroup[]
}

const defaultArg = (delimiter: 'required' | 'optional'): CommandArg => ({
  kind: delimiter,
  valueKind: 'free-text',
})

function positionToOffset(text: string, lineStarts: number[], pos: NeutralPosition): number {
  const lineIndex = Math.min(Math.max(pos.line - 1, 0), lineStarts.length - 1)
  const lineStart = lineStarts[lineIndex]!
  const lineEnd = lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1]! - 1 : text.length
  return Math.min(Math.max(lineStart + pos.column - 1, lineStart), lineEnd)
}

function rangeFromOffsets(lineStarts: number[], start: number, end: number): NeutralRange {
  const a = offsetToLineCol(lineStarts, start)
  const b = offsetToLineCol(lineStarts, end)
  return {
    startLine: a.line,
    startColumn: a.column,
    endLine: b.line,
    endColumn: b.column,
  }
}

function blankMaskedSpans(text: string, spans: Array<[number, number]>): string {
  if (spans.length === 0) return text
  const parts: string[] = []
  let cursor = 0
  for (const [rawStart, rawEnd] of [...spans].sort((a, b) => a[0] - b[0])) {
    const start = Math.max(cursor, rawStart)
    const end = Math.min(text.length, rawEnd)
    if (end <= start) continue
    if (start > cursor) parts.push(text.slice(cursor, start))
    parts.push(text.slice(start, end).replace(/[^\n]/g, ' '))
    cursor = end
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return parts.join('')
}

function cursorIsMasked(tokens: Token[], spans: Array<[number, number]>, offset: number): boolean {
  for (const token of tokens) {
    if (token.type === 'comment' && offset > token.start && offset <= token.end) return true
    if (token.type === 'verb' && offset >= token.start && offset < token.end) return true
  }
  return spans.some(([start, end]) => offset >= start && offset < end)
}

function commandNameContext(
  text: string,
  tokens: Token[],
  cursor: number,
  lineStarts: number[],
  documentPath: string,
): CommandNameCompletionContext | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!
    if (token.type !== 'command' || cursor < token.start + 1 || cursor > token.end) continue
    if (!/^[a-zA-Z@]*$/.test(token.value)) return null
    const start = token.start + 1
    return {
      type: 'command',
      domain: 'command',
      documentPath,
      prefix: text.slice(start, cursor),
      replacementRange: rangeFromOffsets(lineStarts, start, token.end),
    }
  }
  return null
}

function skipWhitespace(text: string, start: number): number {
  let i = start
  while (i < text.length && /\s/.test(text[i]!)) i++
  return i
}

function readBalancedGroup(
  text: string,
  open: number,
): Pick<ParsedGroup, 'closed' | 'contentEnd' | 'end'> {
  const stack: string[] = [text[open] === '{' ? '}' : ']']
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i]!
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === stack[stack.length - 1]) {
      stack.pop()
      if (stack.length === 0) return { closed: true, contentEnd: i, end: i + 1 }
    }
  }
  return { closed: false, contentEnd: text.length, end: text.length }
}

function assignSignature(groups: ParsedGroup[], signature: readonly CommandArg[]): void {
  let signatureIndex = 0
  for (const group of groups) {
    while (
      signatureIndex < signature.length &&
      signature[signatureIndex]!.kind === 'optional' &&
      group.delimiter !== 'optional'
    ) {
      signatureIndex++
    }
    const spec = signature[signatureIndex]
    if (spec?.kind === group.delimiter) {
      group.signatureIndex = signatureIndex
      group.spec = spec
      signatureIndex++
    }
  }
}

function parseInvocation(
  text: string,
  token: Token,
  metadata: CompletionCommandMetadataProvider | undefined,
): ParsedInvocation | null {
  let offset = token.end
  let starred = false
  if (text[offset] === '*') {
    starred = true
    offset++
  }
  const groups: ParsedGroup[] = []
  for (let argumentIndex = 0; argumentIndex < 64; argumentIndex++) {
    offset = skipWhitespace(text, offset)
    const open = text[offset]
    if (open !== '{' && open !== '[') break
    const delimiter = open === '{' ? 'required' : 'optional'
    const balanced = readBalancedGroup(text, offset)
    groups.push({
      delimiter,
      open: offset,
      contentStart: offset + 1,
      contentEnd: balanced.contentEnd,
      end: balanced.end,
      closed: balanced.closed,
      argumentIndex,
      spec: defaultArg(delimiter),
    })
    offset = balanced.end
    if (!balanced.closed) break
  }
  if (groups.length === 0) return null
  const signature = metadata?.getCommandArguments(token.value) ?? getCommandSignature(token.value)
  if (signature) assignSignature(groups, signature)
  return { command: token.value, starred, groups }
}

function topLevelSeparators(text: string, start: number, end: number, separator: string): number[] {
  const result: number[] = []
  const stack: string[] = []
  for (let i = start; i < end; i++) {
    const ch = text[i]!
    if (ch === '\\') {
      i++
      continue
    }
    if (ch === '{') stack.push('}')
    else if (ch === '[') stack.push(']')
    else if (ch === stack[stack.length - 1]) stack.pop()
    else if (stack.length === 0 && ch === separator) result.push(i)
  }
  return result
}

function trimStart(text: string, start: number, end: number): number {
  let cursor = start
  while (cursor < end && /\s/.test(text[cursor]!)) cursor++
  return cursor
}

function trimEnd(text: string, start: number, end: number): number {
  let cursor = end
  while (cursor > start && /\s/.test(text[cursor - 1]!)) cursor--
  return cursor
}

function splitTopLevelValues(text: string, start: number, end: number, list: boolean): string[] {
  const separators = list ? topLevelSeparators(text, start, end, ',') : []
  const values: string[] = []
  let segmentStart = start
  for (const separator of [...separators, end]) {
    const value = text.slice(segmentStart, separator).trim()
    if (value) values.push(value)
    segmentStart = separator + 1
  }
  return values
}

function relatedArguments(text: string, groups: ParsedGroup[]): RelatedCompletionArgument[] {
  const related: RelatedCompletionArgument[] = []
  for (const group of groups) {
    const valueKind = group.spec.valueKind ?? 'free-text'
    if (valueKind === 'free-text' || valueKind === 'key-value') continue
    const item: RelatedCompletionArgument = {
      argumentIndex: group.argumentIndex,
      valueKind,
      values: splitTopLevelValues(
        text,
        group.contentStart,
        group.contentEnd,
        group.spec.list ?? false,
      ),
    }
    if (group.signatureIndex !== undefined) item.signatureIndex = group.signatureIndex
    related.push(item)
  }
  return related
}

interface SegmentInfo {
  prefix: string
  start: number
  end: number
  listIndex: number
  keyValuePosition?: 'key' | 'value'
  key?: string
}

interface SegmentBounds {
  start: number
  end: number
  listIndex: number
}

function listSegmentAtCursor(text: string, group: ParsedGroup, cursor: number): SegmentBounds {
  const listSeparators = group.spec.list
    ? topLevelSeparators(text, group.contentStart, group.contentEnd, ',')
    : []
  let start = group.contentStart
  let end = group.contentEnd
  let listIndex = 0
  for (const separator of listSeparators) {
    if (separator < cursor) {
      start = separator + 1
      listIndex++
    } else {
      end = separator
      break
    }
  }
  return { start, end, listIndex }
}

function keyValueAtCursor(
  text: string,
  segment: SegmentBounds,
  cursor: number,
): Pick<SegmentInfo, 'end' | 'key' | 'keyValuePosition' | 'start'> {
  const equals = topLevelSeparators(text, segment.start, segment.end, '=')[0]
  if (equals === undefined) {
    const start = trimStart(text, segment.start, segment.end)
    return { start, end: trimEnd(text, start, segment.end), keyValuePosition: 'key' }
  }
  const key = text.slice(
    trimStart(text, segment.start, equals),
    trimEnd(text, segment.start, equals),
  )
  if (cursor <= equals) {
    const start = trimStart(text, segment.start, equals)
    return { start, end: trimEnd(text, start, equals), keyValuePosition: 'key', key }
  }
  const start = trimStart(text, equals + 1, segment.end)
  return { start, end: trimEnd(text, start, segment.end), keyValuePosition: 'value', key }
}

function segmentAtCursor(text: string, group: ParsedGroup, cursor: number): SegmentInfo {
  const segment = listSegmentAtCursor(text, group, cursor)
  const semantic =
    group.spec.valueKind === 'key-value'
      ? keyValueAtCursor(text, segment, cursor)
      : {
          start: trimStart(text, segment.start, segment.end),
          end: trimEnd(text, segment.start, segment.end),
        }
  let { start, end } = semantic

  // Preserve leading/trailing whitespace when the cursor is still inside it, and keep the
  // edit range valid when malformed text places the cursor beyond the trimmed segment.
  if (cursor < start) start = cursor
  if (cursor > end) end = cursor
  const info: SegmentInfo = {
    prefix: text.slice(start, cursor),
    start,
    end,
    listIndex: segment.listIndex,
  }
  if ('keyValuePosition' in semantic) info.keyValuePosition = semantic.keyValuePosition
  if ('key' in semantic && semantic.key) info.key = semantic.key
  return info
}

function usedKeys(text: string, group: ParsedGroup, currentListIndex: number): string[] {
  if (group.spec.valueKind !== 'key-value') return []
  const separators = topLevelSeparators(text, group.contentStart, group.contentEnd, ',')
  const keys = new Set<string>()
  let start = group.contentStart
  for (const [index, end] of [...separators, group.contentEnd].entries()) {
    if (index !== currentListIndex) {
      const equals = topLevelSeparators(text, start, end, '=')[0] ?? end
      const key = text.slice(trimStart(text, start, equals), trimEnd(text, start, equals))
      if (key) keys.add(key)
    }
    start = end + 1
  }
  return [...keys].sort()
}

function buildArgumentContext(
  text: string,
  cursor: number,
  lineStarts: number[],
  documentPath: string,
  invocation: ParsedInvocation,
  group: ParsedGroup,
): CommandArgumentCompletionContext {
  const segment = segmentAtCursor(text, group, cursor)
  const valueKind = group.spec.valueKind ?? 'free-text'
  const related = relatedArguments(text, invocation.groups)
  const selector =
    group.spec.selectorArgumentIndex === undefined
      ? undefined
      : related.find((item) => item.signatureIndex === group.spec.selectorArgumentIndex)
  return {
    type: 'argument',
    domain: valueKind,
    documentPath,
    command: invocation.command,
    starred: invocation.starred,
    argumentIndex: group.argumentIndex,
    delimiter: group.delimiter,
    valueKind,
    list: group.spec.list ?? false,
    listIndex: segment.listIndex,
    usedKeys: usedKeys(text, group, segment.listIndex),
    prefix: segment.prefix,
    replacementRange: rangeFromOffsets(lineStarts, segment.start, segment.end),
    relatedArguments: related,
    ...(group.signatureIndex !== undefined ? { signatureIndex: group.signatureIndex } : {}),
    ...(group.spec.keyFamily ? { keyFamily: group.spec.keyFamily } : {}),
    ...(segment.keyValuePosition ? { keyValuePosition: segment.keyValuePosition } : {}),
    ...(segment.key ? { key: segment.key } : {}),
    ...(selector ? { selector } : {}),
  }
}

function argumentContext(
  text: string,
  tokens: Token[],
  cursor: number,
  lineStarts: number[],
  documentPath: string,
  metadata: CompletionCommandMetadataProvider | undefined,
): CommandArgumentCompletionContext | null {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]!
    if (token.type !== 'command' || token.start >= cursor) continue
    const invocation = parseInvocation(text, token, metadata)
    if (!invocation) continue
    const group = invocation.groups.find(
      (candidate) => cursor >= candidate.contentStart && cursor <= candidate.contentEnd,
    )
    if (!group) continue
    return buildArgumentContext(text, cursor, lineStarts, documentPath, invocation, group)
  }
  return null
}

/** Analyze a completion position using the full active document. Never throws. */
export function analyzeCompletionContext(
  document: NeutralDocument,
  position: NeutralPosition,
  metadata?: CompletionCommandMetadataProvider,
): CompletionContext | null {
  try {
    const text = document.getText()
    const lineStarts = buildLineStarts(text)
    const cursor = positionToOffset(text, lineStarts, position)
    const tokens = tokenize(text)
    const spans = maskSpansFromTokens(tokens)
    if (cursorIsMasked(tokens, spans, cursor)) return null
    const masked = blankMaskedSpans(text, spans)
    return (
      commandNameContext(masked, tokens, cursor, lineStarts, document.path) ??
      argumentContext(masked, tokens, cursor, lineStarts, document.path, metadata)
    )
  } catch {
    return null
  }
}
