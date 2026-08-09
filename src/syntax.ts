import {
  collectUserMacroDefinitions,
  expandUserMacroCalls,
  parseLatexFile,
  type UserMacroDefinition,
} from './lsp/latex-parser'
import { NEWCMD_CMDS } from './lsp/latex-patterns'
import { type Token, tokenize } from './lsp/latex-tokenizer'
import { ProjectIndex } from './lsp/project-index'
import { buildLineStarts } from './lsp/source-position'
import type { FileSymbols, SourceLocation } from './lsp/types'

export const LATEX_SYNTAX_SCHEMA_VERSION = 3 as const

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
  expansion: {
    /** Bounded static expansion outcome for this source occurrence. */
    status: 'not-applicable' | 'unresolved' | 'expanded' | 'cycle' | 'truncated'
    depth: number
    /** False when meaning is generated and an editor must not edit a synthetic occurrence. */
    editable: boolean
    /** Expanded TeX surface. Present only for a complete, bounded call expansion. */
    surface?: string
    /** Full invocation replaced by `surface`, including consumed arguments. */
    inputRange?: LatexSyntaxRange
  }
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
  private relinkDeferred = false

  reset(snapshot: LatexProjectSyntaxInput): void {
    for (const state of this.files.values()) this.index.removeFile(state.input.path)
    this.files.clear()
    this.relinkDeferred = true
    try {
      for (const document of snapshot.documents) this.upsert(document)
    } finally {
      this.relinkDeferred = false
    }
    this.refreshMacroDefinitions()
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
    if (!this.relinkDeferred) this.refreshMacroDefinitions()
    return this.files.get(document.fileId)!.syntax
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
    this.refreshMacroDefinitions()
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

  /** Re-link calls after any inventory change without reparsing unchanged files. */
  private refreshMacroDefinitions(): void {
    const catalog = collectProjectMacroCatalog(this.files.values())
    for (const state of this.files.values()) {
      const expansions = new Map(
        expandUserMacroCalls(state.input.content, catalog.expansionDefinitions).map((expansion) => [
          expansion.inputStart,
          expansion,
        ]),
      )
      state.syntax = {
        ...state.syntax,
        macros: state.syntax.macros.map((event) => relinkMacro(event, expansions, catalog)),
      }
    }
  }
}

interface ProjectMacroCatalog {
  bodies: ReadonlyMap<string, MacroBody>
  definitions: ReadonlyMap<string, readonly LatexSyntaxSourceRef[]>
  expansionDefinitions: ReadonlyMap<string, UserMacroDefinition>
}

function collectProjectMacroCatalog(states: Iterable<FileState>): ProjectMacroCatalog {
  const files = [...states]
  const definitions = new Map<string, LatexSyntaxSourceRef[]>()
  const bodies = new Map<string, MacroBody>()
  const ambiguous = new Set<string>()
  for (const state of files) {
    mergeUniqueMacroBodies(bodies, ambiguous, collectMacroBodies(state.input.content))
    for (const event of state.syntax.macros) {
      if (event.kind !== 'definition') continue
      const bucket = definitions.get(event.name)
      if (bucket) bucket.push(event.source)
      else definitions.set(event.name, [event.source])
    }
  }
  return {
    bodies,
    definitions,
    expansionDefinitions: collectUserMacroDefinitions(files.map((state) => state.input.content)),
  }
}

function mergeUniqueMacroBodies(
  target: Map<string, MacroBody>,
  ambiguous: Set<string>,
  additions: ReadonlyMap<string, MacroBody>,
): void {
  for (const [name, body] of additions) {
    if (target.has(name)) {
      target.delete(name)
      ambiguous.add(name)
    } else if (!ambiguous.has(name)) target.set(name, body)
  }
}

function relinkMacro(
  event: LatexMacroEvent,
  expansions: ReadonlyMap<number, { inputStart: number; inputEnd: number; surface: string }>,
  catalog: ProjectMacroCatalog,
): LatexMacroEvent {
  const definitions = catalog.definitions.get(event.name) ?? []
  if (event.kind === 'definition') return { ...event, definitions }
  const expanded = expansions.get(event.source.range.startOffset - 1)
  const expansion =
    definitions.length === 1
      ? macroExpansion(event.name, catalog.bodies)
      : { status: 'unresolved' as const, depth: 0, editable: true }
  return {
    ...event,
    definitions,
    expansion:
      expansion.status === 'expanded' && expanded
        ? {
            ...expansion,
            surface: expanded.surface,
            inputRange: { startOffset: expanded.inputStart, endOffset: expanded.inputEnd },
          }
        : expansion,
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
  const expansionGraph = collectMacroBodies(document.content)
  const callExpansions = new Map(
    expandUserMacroCalls(document.content).map((expansion) => [expansion.inputStart, expansion]),
  )
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
    expansion: { status: 'not-applicable', depth: 0, editable: true },
  }))
  for (const use of symbols.commandUses) {
    const source = sourceRef(document, lineStarts, use.location, use.name.length)
    const isDefinition = (definitions.get(use.name) ?? []).some(
      (definition) => definition.range.startOffset === source.range.startOffset,
    )
    if (!isDefinition) {
      const expanded = callExpansions.get(source.range.startOffset - 1)
      const expansion = macroExpansion(use.name, expansionGraph)
      events.push({
        kind: 'call',
        name: use.name,
        source,
        definitions: definitions.get(use.name) ?? [],
        expansion:
          expansion.status === 'expanded' && expanded
            ? {
                ...expansion,
                surface: expanded.surface,
                inputRange: { startOffset: expanded.inputStart, endOffset: expanded.inputEnd },
              }
            : expansion,
      })
    }
  }
  return events.sort(
    (left, right) => left.source.range.startOffset - right.source.range.startOffset,
  )
}

interface MacroBody {
  body: string
}

const SYNTAX_MACRO_DEPTH_LIMIT = 4
const SYNTAX_NEWCMD_RE = new RegExp(
  `\\\\(?:${NEWCMD_CMDS}|DeclareMathOperator)\\*?\\{\\\\([a-zA-Z@]+)\\}(?:\\[\\d+\\])?(?:\\[[^\\]]*\\])?\\s*\\{`,
  'g',
)
const SYNTAX_DEF_RE = /\\def\\([a-zA-Z@]+)(?:#\d)*\s*\{/g

/** Minimal definition graph used only to report provenance; parsing remains owned by latex-parser. */
function collectMacroBodies(source: string): Map<string, MacroBody> {
  const bodies = new Map<string, MacroBody>()
  const collect = (pattern: RegExp): void => {
    for (const match of source.matchAll(pattern)) {
      const open = match.index + match[0].length - 1
      const body = balancedGroup(source, open)
      if (body !== null) bodies.set(match[1]!, { body })
    }
  }
  collect(SYNTAX_NEWCMD_RE)
  collect(SYNTAX_DEF_RE)
  return bodies
}

function balancedGroup(source: string, open: number): string | null {
  if (source[open] !== '{') return null
  let depth = 1
  for (let cursor = open + 1; cursor < source.length; cursor++) {
    if (source[cursor] === '\\') {
      cursor++
      continue
    }
    if (source[cursor] === '{') depth++
    if (source[cursor] === '}' && --depth === 0) return source.slice(open + 1, cursor)
  }
  return null
}

function macroExpansion(
  name: string,
  graph: ReadonlyMap<string, MacroBody>,
): LatexMacroEvent['expansion'] {
  if (!graph.has(name)) return { status: 'unresolved', depth: 0, editable: true }
  const outcome = traceMacro(name, graph, [], 0)
  return { ...outcome, editable: false }
}

function traceMacro(
  name: string,
  graph: ReadonlyMap<string, MacroBody>,
  stack: readonly string[],
  depth: number,
): Pick<LatexMacroEvent['expansion'], 'status' | 'depth'> {
  if (stack.includes(name)) return { status: 'cycle', depth }
  const body = graph.get(name)
  if (!body) return { status: 'expanded', depth }
  const dependencies = [...body.body.matchAll(/\\([a-zA-Z@]+)/g)]
    .map((match) => match[1]!)
    .filter((dependency) => graph.has(dependency))
  if (dependencies.length === 0) return { status: 'expanded', depth }
  if (depth >= SYNTAX_MACRO_DEPTH_LIMIT) return { status: 'truncated', depth }

  let deepest = depth
  for (const dependency of dependencies) {
    const outcome = traceMacro(dependency, graph, [...stack, name], depth + 1)
    if (outcome.status === 'cycle') return outcome
    if (outcome.status === 'truncated') return outcome
    deepest = Math.max(deepest, outcome.depth)
  }
  return { status: 'expanded', depth: deepest }
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
