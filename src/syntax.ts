import { parseLatexFile } from './lsp/latex-parser'
import { type Token, tokenize } from './lsp/latex-tokenizer'
import { ProjectIndex } from './lsp/project-index'
import { buildLineStarts } from './lsp/source-position'
import type { FileSymbols, SourceLocation } from './lsp/types'

export const LATEX_SYNTAX_SCHEMA_VERSION = 1 as const

export interface LatexSyntaxRange {
  startOffset: number
  endOffset: number
}

export interface LatexSyntaxSourceRef {
  fileId: string
  path: string
  range: LatexSyntaxRange
}

export interface LatexMathRegion {
  delimiter: string
  fullRange: LatexSyntaxRange
  contentRange: LatexSyntaxRange
  closed: boolean
}

export interface LatexMacroEvent {
  kind: 'definition' | 'call'
  name: string
  source: LatexSyntaxSourceRef
  definitions: readonly LatexSyntaxSourceRef[]
}

export interface LatexInclude {
  path: string
  type: 'input' | 'include' | 'subfile'
  source: LatexSyntaxSourceRef
}

export interface LatexSyntaxDiagnostic {
  code: 'unclosed-math'
  message: string
  severity: 'warning'
  range: LatexSyntaxRange
}

export interface LatexDocumentInput {
  fileId: string
  path: string
  content: string
  documentVersion: number
  language?: 'latex' | 'markdown'
}

export interface LatexProjectSyntaxInput {
  documents: readonly LatexDocumentInput[]
}

export interface LatexFileSyntax {
  schemaVersion: typeof LATEX_SYNTAX_SCHEMA_VERSION
  fileId: string
  path: string
  documentVersion: number
  mathRegions: readonly LatexMathRegion[]
  macros: readonly LatexMacroEvent[]
  includes: readonly LatexInclude[]
  diagnostics: readonly LatexSyntaxDiagnostic[]
}

export interface LatexSyntaxStats {
  documents: number
  /** Number of source tokenization/parsing passes performed by this service. */
  parseCount: number
}

interface FileState {
  input: LatexDocumentInput
  syntax: LatexFileSyntax
}

interface OpenMath {
  delimiter: string
  close: string
  fullStart: number
  contentStart: number
}

interface MathBoundary {
  kind: 'open' | 'close' | 'toggle'
  delimiter: string
  close: string
  fullEnd: number
}

const MATH_ENVIRONMENTS = new Set([
  'math',
  'displaymath',
  'equation',
  'equation*',
  'align',
  'align*',
  'alignat',
  'alignat*',
  'gather',
  'gather*',
  'multline',
  'multline*',
  'flalign',
  'flalign*',
])

/**
 * Stable, versioned syntax boundary for consumers such as Semath.
 * Offsets are UTF-16, zero-based and half-open, matching JavaScript and Monaco.
 */
export class LatexSyntaxService {
  private readonly files = new Map<string, FileState>()
  private readonly index = new ProjectIndex()
  private parseCount = 0

  reset(snapshot: LatexProjectSyntaxInput): void {
    for (const state of this.files.values()) this.index.removeFile(state.input.path)
    this.files.clear()
    for (const document of snapshot.documents) this.upsert(document)
  }

  upsert(document: LatexDocumentInput): LatexFileSyntax {
    const previous = this.files.get(document.fileId)
    if (
      previous &&
      (previous.input.path !== document.path || previous.input.language === 'markdown')
    )
      this.index.removeFile(previous.input.path)

    this.parseCount++
    const tokens = tokenize(document.content)
    const symbols = parseLatexFile(document.content, document.path, tokens)
    if (document.language !== 'markdown') this.index.updateFileSymbols(document.path, symbols)
    const syntax = buildFileSyntax(document, tokens, symbols)
    this.files.set(document.fileId, { input: { ...document }, syntax })
    return syntax
  }

  move(fileId: string, nextPath: string): void {
    const state = this.files.get(fileId)
    if (!state) throw new Error(`unknown fileId: ${fileId}`)
    this.upsert({ ...state.input, path: nextPath })
  }

  remove(fileId: string): void {
    const state = this.files.get(fileId)
    if (!state) return
    this.index.removeFile(state.input.path)
    this.files.delete(fileId)
  }

  getFile(fileId: string): LatexFileSyntax | null {
    return this.files.get(fileId)?.syntax ?? null
  }

  /** The LSP service can reuse the exact same parsed snapshot. */
  getProjectIndex(): ProjectIndex {
    return this.index
  }

  getStats(): LatexSyntaxStats {
    return { documents: this.files.size, parseCount: this.parseCount }
  }
}

export function createLatexSyntaxService(snapshot?: LatexProjectSyntaxInput): LatexSyntaxService {
  const service = new LatexSyntaxService()
  if (snapshot) service.reset(snapshot)
  return service
}

function buildFileSyntax(
  document: LatexDocumentInput,
  tokens: readonly Token[],
  symbols: FileSymbols,
): LatexFileSyntax {
  const mathRegions = findMathRegions(document.content, tokens, document.language === 'markdown')
  const diagnostics: LatexSyntaxDiagnostic[] = mathRegions
    .filter((region) => !region.closed)
    .map((region) => ({
      code: 'unclosed-math',
      message: `Unclosed ${region.delimiter} math region`,
      severity: 'warning',
      range: region.fullRange,
    }))
  return {
    schemaVersion: LATEX_SYNTAX_SCHEMA_VERSION,
    fileId: document.fileId,
    path: document.path,
    documentVersion: document.documentVersion,
    mathRegions,
    macros: macroEvents(document, symbols),
    includes: includes(document, symbols),
    diagnostics,
  }
}

function findMathRegions(
  source: string,
  allTokens: readonly Token[],
  markdown: boolean,
): LatexMathRegion[] {
  const excluded = [
    ...conditionalMaskSpans(allTokens, source.length),
    ...(markdown ? markdownExcludedSpans(source) : []),
  ]
  const tokens = allTokens.filter(
    (token) => token.type !== 'comment' && token.type !== 'verb' && !inside(token.start, excluded),
  )
  const regions: LatexMathRegion[] = []
  let open: OpenMath | null = null

  for (const token of tokens) {
    const boundary = mathBoundary(source, token)
    if (!boundary) continue
    if (!open && boundary.kind !== 'close') {
      open = {
        delimiter: boundary.delimiter,
        close: boundary.close,
        fullStart: token.start,
        contentStart: boundary.fullEnd,
      }
    } else if (open && boundary.kind !== 'open' && boundary.close === open.close) {
      regions.push(closedRegion(open, token.start, boundary.fullEnd))
      open = null
    }
  }

  if (open) {
    regions.push({
      delimiter: open.delimiter,
      fullRange: { startOffset: open.fullStart, endOffset: source.length },
      contentRange: { startOffset: open.contentStart, endOffset: source.length },
      closed: false,
    })
  }
  return regions
}

function mathBoundary(source: string, token: Token): MathBoundary | null {
  const environment = environmentAt(source, token)
  if (environment && MATH_ENVIRONMENTS.has(environment.name)) {
    return {
      kind: environment.kind === 'begin' ? 'open' : 'close',
      delimiter: `\\begin{${environment.name}}`,
      close: `env:${environment.name}`,
      fullEnd: environment.end,
    }
  }
  const event = mathEvent(token)
  return event ? { ...event, fullEnd: token.end } : null
}

function closedRegion(open: OpenMath, contentEnd: number, fullEnd: number): LatexMathRegion {
  return {
    delimiter: open.delimiter,
    fullRange: { startOffset: open.fullStart, endOffset: fullEnd },
    contentRange: { startOffset: open.contentStart, endOffset: contentEnd },
    closed: true,
  }
}

function mathEvent(
  token: Token,
): { kind: 'open' | 'close' | 'toggle'; delimiter: string; close: string } | null {
  if (token.type === 'math') {
    return { kind: 'toggle', delimiter: token.value, close: token.value }
  }
  if (token.type !== 'command') return null
  if (token.value === '(') return { kind: 'open', delimiter: '\\(', close: ')' }
  if (token.value === '[') return { kind: 'open', delimiter: '\\[', close: ']' }
  if (token.value === ')') return { kind: 'close', delimiter: '\\(', close: ')' }
  if (token.value === ']') return { kind: 'close', delimiter: '\\[', close: ']' }
  return null
}

function environmentAt(
  source: string,
  token: Token,
): { kind: 'begin' | 'end'; name: string; end: number } | null {
  if (token.type !== 'command' || (token.value !== 'begin' && token.value !== 'end')) return null
  const match = /^\s*\{([^{}]+)\}/.exec(source.slice(token.end))
  if (!match) return null
  return {
    kind: token.value,
    name: match[1]!,
    end: token.end + match[0].length,
  }
}

function markdownExcludedSpans(source: string): Array<readonly [number, number]> {
  const spans = markdownFenceSpans(source)
  spans.push(...markdownFrontmatterSpans(source), ...markdownCommentSpans(source))
  for (const [lineStart, line] of markdownLines(source)) {
    let open: { length: number; start: number } | null = null
    for (const match of line.matchAll(/`+/g)) {
      const start = lineStart + match.index
      if (inside(start, spans)) continue
      const length = match[0].length
      if (!open) open = { length, start }
      else if (open.length === length) {
        spans.push([open.start, start + length])
        open = null
      }
    }
    if (open) spans.push([open.start, lineStart + line.length])
  }
  return spans
}

function markdownFenceSpans(source: string): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = []
  const fence = /^\s*(`{3,}|~{3,})/gm
  let opened: { marker: string; start: number } | null = null
  for (const match of source.matchAll(fence)) {
    const marker = match[1]!
    if (!opened) opened = { marker: marker[0]!, start: match.index }
    else if (marker[0] === opened.marker) {
      const lineEnd = source.indexOf('\n', match.index)
      spans.push([opened.start, lineEnd < 0 ? source.length : lineEnd + 1])
      opened = null
    }
  }
  if (opened) spans.push([opened.start, source.length])
  return spans
}

function markdownFrontmatterSpans(source: string): Array<readonly [number, number]> {
  if (!/^(?:---|\+\+\+)\s*(?:\r?\n|$)/.test(source)) return []
  const end = /^(?:---|\.\.\.|\+\+\+)\s*$/gm
  end.lastIndex = source.indexOf('\n') + 1
  const match = end.exec(source)
  return [[0, match ? match.index + match[0].length : source.length]]
}

function markdownCommentSpans(source: string): Array<readonly [number, number]> {
  return [...source.matchAll(/<!--[\s\S]*?(?:-->|$)/g)].map((match) => [
    match.index,
    match.index + match[0].length,
  ])
}

function markdownLines(source: string): Array<readonly [number, string]> {
  const lines: Array<readonly [number, string]> = []
  let start = 0
  for (const line of source.split('\n')) {
    lines.push([start, line])
    start += line.length + 1
  }
  return lines
}

interface ConditionalFrame {
  falseStart: number
  kind: 'false' | 'other' | 'true'
  sawElse: boolean
}

function conditionalMaskSpans(
  tokens: readonly Token[],
  sourceLength: number,
): Array<readonly [number, number]> {
  const spans: Array<readonly [number, number]> = []
  const stack: ConditionalFrame[] = []
  for (const token of tokens) {
    if (token.type === 'command') updateConditionalState(token, stack, spans)
  }
  for (const frame of stack) {
    if (frame.falseStart >= 0) spans.push([frame.falseStart, sourceLength])
  }
  return spans
}

function updateConditionalState(
  token: Token,
  stack: ConditionalFrame[],
  spans: Array<readonly [number, number]>,
): void {
  if (token.value === 'iffalse') {
    stack.push({ falseStart: token.end, kind: 'false', sawElse: false })
    return
  }
  if (token.value === 'iftrue') {
    stack.push({ falseStart: -1, kind: 'true', sawElse: false })
    return
  }
  if (token.value === 'else') {
    updateConditionalElse(stack[stack.length - 1], token, spans)
    return
  }
  if (token.value === 'fi') {
    closeConditional(stack.pop(), token, spans)
    return
  }
  if (token.value.startsWith('if') && token.value !== 'iff')
    stack.push({ falseStart: -1, kind: 'other', sawElse: false })
}

function updateConditionalElse(
  frame: ConditionalFrame | undefined,
  token: Token,
  spans: Array<readonly [number, number]>,
): void {
  if (!frame || frame.sawElse) return
  frame.sawElse = true
  if (frame.kind === 'false') spans.push([frame.falseStart, token.start])
  else if (frame.kind === 'true') frame.falseStart = token.end
}

function closeConditional(
  frame: ConditionalFrame | undefined,
  token: Token,
  spans: Array<readonly [number, number]>,
): void {
  if (!frame) return
  if (frame.kind === 'false' && !frame.sawElse) spans.push([frame.falseStart, token.start])
  else if (frame.kind === 'true' && frame.sawElse) spans.push([frame.falseStart, token.start])
}

function inside(offset: number, spans: readonly (readonly [number, number])[]): boolean {
  return spans.some(([start, end]) => start <= offset && offset < end)
}

function macroEvents(document: LatexDocumentInput, symbols: FileSymbols): LatexMacroEvent[] {
  const lineStarts = buildLineStarts(document.content)
  const definitions = new Map<string, LatexSyntaxSourceRef[]>()
  for (const definition of symbols.commands) {
    const source = sourceRef(document, lineStarts, definition.location, definition.name.length)
    const bucket = definitions.get(definition.name)
    if (bucket) bucket.push(source)
    else definitions.set(definition.name, [source])
  }

  const events: LatexMacroEvent[] = symbols.commands.map((definition) => ({
    kind: 'definition',
    name: definition.name,
    source: sourceRef(document, lineStarts, definition.location, definition.name.length),
    definitions: definitions.get(definition.name) ?? [],
  }))
  for (const use of symbols.commandUses) {
    const source = sourceRef(document, lineStarts, use.location, use.name.length)
    const isDefinition = (definitions.get(use.name) ?? []).some(
      (definition) => definition.range.startOffset === source.range.startOffset,
    )
    if (!isDefinition) {
      events.push({
        kind: 'call',
        name: use.name,
        source,
        definitions: definitions.get(use.name) ?? [],
      })
    }
  }
  return events.sort(
    (left, right) => left.source.range.startOffset - right.source.range.startOffset,
  )
}

function includes(document: LatexDocumentInput, symbols: FileSymbols): LatexInclude[] {
  const lineStarts = buildLineStarts(document.content)
  return symbols.includes.map((include) => ({
    path: include.path,
    type: include.type,
    source: sourceRef(document, lineStarts, include.location, include.path.length),
  }))
}

function sourceRef(
  document: LatexDocumentInput,
  lineStarts: readonly number[],
  location: SourceLocation,
  length: number,
): LatexSyntaxSourceRef {
  const startOffset = (lineStarts[location.line - 1] ?? 0) + location.column - 1
  return {
    fileId: document.fileId,
    path: document.path,
    range: { startOffset, endOffset: startOffset + length },
  }
}
