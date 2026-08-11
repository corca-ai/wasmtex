import {
  collectUserMacroDefinitions,
  expandUserMacroCalls,
  parseLatexFile,
  type UserMacroArgument,
  type UserMacroDefinition,
} from './lsp/latex-parser'
import { CITE_CMDS, NEWCMD_CMDS } from './lsp/latex-patterns'
import { type Token, tokenize } from './lsp/latex-tokenizer'
import { ProjectIndex } from './lsp/project-index'
import { buildLineStarts } from './lsp/source-position'
import type { FileSymbols, SourceLocation } from './lsp/types'
import { buildNotationCst } from './notation-cst'
import { collectRichStructuralDeclarations } from './structural-declarations'
import {
  LATEX_SYNTAX_SCHEMA_VERSION,
  type LatexDocumentSyntaxSnapshot,
  type LatexNotationArgument,
  type LatexNotationNode,
  type LatexProseAnnotation,
  type LatexStructuralDeclaration,
  type LatexSyntaxRange,
  type LatexSyntaxScope,
  type LatexSyntaxSourceRef,
  type LatexVisibleProseSpan,
} from './syntax-contract'

export * from './math-command-spec'
export { findLatexNotationPath } from './notation-cst'
export * from './syntax-contract'

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
  arguments?: readonly LatexMacroArgument[]
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
    /** Neutral generated syntax for complete composite expansions. */
    notation?: LatexGeneratedNotationTree
  }
}

export interface LatexGeneratedNotationTree {
  nodes: readonly LatexGeneratedNotationNode[]
  root: number
}

export interface LatexGeneratedNotationNode {
  kind: LatexNotationNode['kind']
  children: readonly number[]
  state: LatexNotationNode['state']
  name?: string
  text?: string
  arguments?: readonly {
    node: number
    role: LatexNotationArgument['role']
    syntax: LatexNotationArgument['syntax']
  }[]
  lexicalClass?: LatexNotationNode['lexicalClass']
  mathClass?: LatexNotationNode['mathClass']
}

export interface LatexMacroArgument {
  index: number
  kind: 'required' | 'optional'
  value: string
  source: LatexSyntaxSourceRef
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

export interface LatexSyntaxCancellationToken {
  readonly isCancellationRequested: boolean
}

export class LatexSyntaxCancelledError extends Error {
  override readonly name = 'LatexSyntaxCancelledError'
}

export interface LatexFileSyntax extends LatexDocumentSyntaxSnapshot {
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
  notationNodes: number
  recoveredNodes: number
  snapshotBytes: number
  lastInvalidatedDocuments: number
  lastTransferBytes: number
}

interface FileState {
  input: LatexDocumentInput
  baseSyntax: LatexFileSyntax
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

const UTF8_ENCODER = new TextEncoder()

/**
 * Stable, versioned syntax boundary for consumers such as Semath.
 * Offsets are UTF-16, zero-based and half-open, matching JavaScript and Monaco.
 */
export class LatexSyntaxService {
  private readonly files = new Map<string, FileState>()
  private readonly index = new ProjectIndex()
  private macroCatalog = emptyProjectMacroCatalog()
  private parseCount = 0
  private relinkDeferred = false
  private lastTransferFileIds: readonly string[] = []

  reset(snapshot: LatexProjectSyntaxInput): void {
    for (const state of this.files.values()) this.index.removeFile(state.input.path)
    this.files.clear()
    this.relinkDeferred = true
    try {
      for (const document of snapshot.documents) this.upsert(document)
    } finally {
      this.relinkDeferred = false
    }
    this.lastTransferFileIds = this.refreshMacroDefinitions(
      new Set(snapshot.documents.map((document) => document.fileId)),
      true,
    )
  }

  upsert(
    document: LatexDocumentInput,
    cancellationToken?: LatexSyntaxCancellationToken,
  ): LatexFileSyntax {
    const input = {
      ...document,
      language:
        document.language ?? (/\.(?:md|markdown)$/iu.test(document.path) ? 'markdown' : 'latex'),
    } as const
    const previous = this.files.get(document.fileId)
    throwIfSyntaxCancelled(cancellationToken)
    this.parseCount++
    const tokens = tokenize(input.content)
    throwIfSyntaxCancelled(cancellationToken)
    const symbols = parseLatexFile(input.content, input.path, tokens)
    throwIfSyntaxCancelled(cancellationToken)
    const syntax = buildFileSyntax(input, tokens, symbols, cancellationToken)
    throwIfSyntaxCancelled(cancellationToken)

    if (
      previous &&
      previous.input.language !== 'markdown' &&
      (previous.input.path !== input.path || input.language === 'markdown')
    ) {
      this.index.removeFile(previous.input.path)
    }
    if (input.language !== 'markdown') this.index.updateFileSymbols(input.path, symbols)
    this.files.set(input.fileId, { input, baseSyntax: syntax, syntax })
    if (!this.relinkDeferred) {
      this.lastTransferFileIds = this.refreshMacroDefinitions(new Set([input.fileId]))
    }
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
    this.lastTransferFileIds = this.refreshMacroDefinitions()
  }

  getFile(fileId: string): LatexFileSyntax | null {
    return this.files.get(fileId)?.syntax ?? null
  }

  /** Snapshots whose syntax/provenance changed in the latest inventory mutation. */
  getInvalidatedFiles(): readonly LatexFileSyntax[] {
    return this.lastTransferFileIds.flatMap((fileId) => {
      const syntax = this.files.get(fileId)?.syntax
      return syntax ? [syntax] : []
    })
  }

  /** The LSP service can reuse the exact same parsed snapshot. */
  getProjectIndex(): ProjectIndex {
    return this.index
  }

  getStats(): LatexSyntaxStats {
    const syntaxes = [...this.files.values()].map((state) => state.syntax)
    const transferred = this.lastTransferFileIds.flatMap((fileId) => {
      const syntax = this.files.get(fileId)?.syntax
      return syntax ? [syntax] : []
    })
    return {
      documents: this.files.size,
      parseCount: this.parseCount,
      notationNodes: syntaxes.reduce((total, syntax) => total + syntax.nodes.length, 0),
      recoveredNodes: syntaxes.reduce(
        (total, syntax) => total + syntax.nodes.filter(isRecoveredNotationNode).length,
        0,
      ),
      snapshotBytes: syntaxWireBytes(syntaxes),
      lastInvalidatedDocuments: this.lastTransferFileIds.length,
      lastTransferBytes: syntaxWireBytes(transferred),
    }
  }

  /** Re-link calls after any inventory change without reparsing unchanged files. */
  private refreshMacroDefinitions(
    directlyChanged: ReadonlySet<string> = new Set(),
    relinkAll = false,
  ): readonly string[] {
    const catalog = collectProjectMacroCatalog(this.files.values())
    const changedMacros = changedMacroNames(this.macroCatalog, catalog)
    const invalidated: string[] = []
    for (const [fileId, state] of this.files) {
      if (
        !relinkAll &&
        !directlyChanged.has(fileId) &&
        (changedMacros.size === 0 ||
          !state.baseSyntax.macros.some((event) => changedMacros.has(event.name)))
      ) {
        continue
      }
      const expansions = new Map(
        expandUserMacroCalls(state.input.content, catalog.expansionDefinitions).map((expansion) => [
          expansion.inputStart,
          expansion,
        ]),
      )
      const macros = state.baseSyntax.macros.map((event) => relinkMacro(event, expansions, catalog))
      state.syntax = {
        ...state.baseSyntax,
        macros,
        nodes: relinkNotationNodes(state.baseSyntax, macros),
      }
      invalidated.push(fileId)
    }
    this.macroCatalog = catalog
    return invalidated
  }
}

interface ProjectMacroCatalog {
  bodies: ReadonlyMap<string, MacroBody>
  definitions: ReadonlyMap<string, readonly LatexSyntaxSourceRef[]>
  expansionDefinitions: ReadonlyMap<string, UserMacroDefinition>
}

function emptyProjectMacroCatalog(): ProjectMacroCatalog {
  return { bodies: new Map(), definitions: new Map(), expansionDefinitions: new Map() }
}

function changedMacroNames(
  previous: ProjectMacroCatalog,
  next: ProjectMacroCatalog,
): ReadonlySet<string> {
  const names = new Set([
    ...previous.bodies.keys(),
    ...previous.definitions.keys(),
    ...previous.expansionDefinitions.keys(),
    ...next.bodies.keys(),
    ...next.definitions.keys(),
    ...next.expansionDefinitions.keys(),
  ])
  return new Set(
    [...names].filter(
      (name) => macroCatalogEntry(previous, name) !== macroCatalogEntry(next, name),
    ),
  )
}

function macroCatalogEntry(catalog: ProjectMacroCatalog, name: string): string {
  return JSON.stringify({
    body: catalog.bodies.get(name),
    definitions: catalog.definitions.get(name),
    expansion: catalog.expansionDefinitions.get(name),
  })
}

function collectProjectMacroCatalog(states: Iterable<FileState>): ProjectMacroCatalog {
  const files = [...states]
  const definitions = new Map<string, LatexSyntaxSourceRef[]>()
  const bodies = new Map<string, MacroBody>()
  const ambiguous = new Set<string>()
  for (const state of files) {
    mergeUniqueMacroBodies(bodies, ambiguous, collectMacroBodies(state.input.content))
    for (const event of state.baseSyntax.macros) {
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
  expansions: ReadonlyMap<
    number,
    {
      inputStart: number
      inputEnd: number
      surface: string
      arguments: readonly UserMacroArgument[]
    }
  >,
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
    ...(expanded === undefined ? {} : { arguments: macroArguments(event, expanded.arguments) }),
    expansion:
      expansion.status === 'expanded' && expanded
        ? {
            ...expansion,
            surface: expanded.surface,
            inputRange: { startOffset: expanded.inputStart, endOffset: expanded.inputEnd },
            ...compositeNotation(expanded.surface),
          }
        : expansion,
  }
}

function macroArguments(
  event: LatexMacroEvent,
  arguments_: readonly UserMacroArgument[],
): LatexMacroArgument[] {
  return arguments_.map((argument) => ({
    index: argument.index,
    kind: argument.kind,
    value: argument.value,
    source: {
      fileId: event.source.fileId,
      path: event.source.path,
      range: { startOffset: argument.inputStart, endOffset: argument.inputEnd },
    },
  }))
}

function relinkNotationNodes(
  syntax: LatexFileSyntax,
  macros: readonly LatexMacroEvent[],
): readonly LatexNotationNode[] {
  const expansions = new Map(
    macros
      .filter(
        (event) =>
          event.kind === 'call' &&
          event.expansion.status === 'expanded' &&
          event.expansion.surface !== undefined &&
          event.expansion.inputRange !== undefined,
      )
      .map((event) => [event.expansion.inputRange!.startOffset, event] as const),
  )
  if (expansions.size === 0) return syntax.nodes
  return syntax.nodes.map((node) => relinkNotationNode(node, syntax, expansions))
}

function relinkNotationNode(
  node: LatexNotationNode,
  syntax: LatexFileSyntax,
  expansions: ReadonlyMap<number, LatexMacroEvent>,
): LatexNotationNode {
  const commandStart = node.ranges.command?.startOffset
  if (node.kind !== 'command' || commandStart === undefined) return node
  const event = expansions.get(commandStart)
  const surface = event?.expansion.surface
  if (!event || surface === undefined) return node
  if (event.expansion.notation) return node
  const shape = expandedNotationShape(surface)
  if (!shape) return node
  const shapeArguments =
    shape.kind === 'named-operator' && node.children.length === 0 ? [] : shape.arguments
  if (!shapeArgumentsMatch(shapeArguments, node.children)) return node
  return expandedCallNode(node, syntax, event, shape, shapeArguments)
}

function shapeArgumentsMatch(
  arguments_: readonly LatexNotationArgument[],
  children: readonly number[],
): boolean {
  return arguments_.length === 0 || (children.length > 0 && arguments_.length === children.length)
}

function expandedCallNode(
  node: LatexNotationNode,
  syntax: LatexFileSyntax,
  event: LatexMacroEvent,
  shape: NonNullable<ReturnType<typeof expandedNotationShape>>,
  shapeArguments: readonly LatexNotationArgument[],
): LatexNotationNode {
  const arguments_ = shapeArguments.map((argument, index) => ({
    ...argument,
    node: node.children[index]!,
    range: syntax.nodes[node.children[index]!]!.ranges.full,
  }))
  const {
    name: _name,
    text: _text,
    arguments: _arguments,
    lexicalClass: _lexicalClass,
    mathClass: _mathClass,
    ...base
  } = node
  const { editable: _editable, ...ranges } = node.ranges
  const callSite = node.provenance?.source ?? {
    fileId: syntax.fileId,
    path: syntax.path,
    range: node.ranges.full,
  }
  return {
    ...base,
    kind: shape.kind,
    state: shape.state,
    ...(shape.name === undefined ? {} : { name: shape.name }),
    ...(shape.text === undefined ? {} : { text: shape.text }),
    ...(shape.lexicalClass === undefined ? {} : { lexicalClass: shape.lexicalClass }),
    ...(shape.mathClass === undefined ? {} : { mathClass: shape.mathClass }),
    ...(arguments_.length === 0 ? {} : { arguments: arguments_ }),
    ranges,
    provenance: {
      origin: 'expansion',
      source: callSite,
      callSite,
      definitions: event.definitions,
      editable: false,
    },
  }
}

function expandedNotationShape(surface: string): {
  kind: LatexNotationNode['kind']
  state: LatexNotationNode['state']
  name?: string
  text?: string
  arguments: readonly LatexNotationArgument[]
  lexicalClass?: LatexNotationNode['lexicalClass']
  mathClass?: LatexNotationNode['mathClass']
} | null {
  const notation = buildNotationCst(
    { fileId: 'generated', path: 'generated', content: surface },
    tokenize(surface),
    [
      {
        delimiter: 'generated',
        fullRange: { startOffset: 0, endOffset: surface.length },
        contentRange: { startOffset: 0, endOffset: surface.length },
        closed: true,
      },
    ],
  )
  const root = notation.nodes[notation.mathRoots[0]!.node]!
  if (root.children.length !== 1) return null
  const node = notation.nodes[root.children[0]!]!
  if (
    node.kind !== 'token' &&
    node.kind !== 'modifier' &&
    node.kind !== 'style' &&
    node.kind !== 'named-operator'
  ) {
    return null
  }
  return {
    kind: node.kind,
    state: node.state,
    arguments: node.arguments ?? [],
    ...(node.name === undefined ? {} : { name: node.name }),
    ...(node.text === undefined ? {} : { text: node.text }),
    ...(node.lexicalClass === undefined ? {} : { lexicalClass: node.lexicalClass }),
    ...(node.mathClass === undefined ? {} : { mathClass: node.mathClass }),
  }
}

function generatedNotationTree(surface: string): LatexGeneratedNotationTree {
  const notation = buildNotationCst(
    { fileId: 'generated', path: 'generated', content: surface },
    tokenize(surface),
    [
      {
        delimiter: 'generated',
        fullRange: { startOffset: 0, endOffset: surface.length },
        contentRange: { startOffset: 0, endOffset: surface.length },
        closed: true,
      },
    ],
  )
  return {
    nodes: notation.nodes.map((node) => ({
      kind: node.kind,
      children: node.children,
      state: node.state,
      ...(node.name === undefined ? {} : { name: node.name }),
      ...(node.text === undefined ? {} : { text: node.text }),
      ...(node.lexicalClass === undefined ? {} : { lexicalClass: node.lexicalClass }),
      ...(node.arguments === undefined
        ? {}
        : {
            arguments: node.arguments.map(({ node, role, syntax }) => ({ node, role, syntax })),
          }),
      ...(node.mathClass === undefined ? {} : { mathClass: node.mathClass }),
    })),
    root: notation.mathRoots[0]!.node,
  }
}

function compositeNotation(surface: string): { notation?: LatexGeneratedNotationTree } {
  const notation = generatedNotationTree(surface)
  const root = notation.nodes[notation.root]
  const node = root?.children.length === 1 ? notation.nodes[root.children[0]!] : undefined
  return node && ['token', 'modifier', 'style', 'named-operator'].includes(node.kind)
    ? {}
    : { notation }
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
  cancellationToken?: LatexSyntaxCancellationToken,
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
  const documentSyntax = buildDocumentSyntax(
    document,
    tokens,
    symbols,
    mathRegions,
    cancellationToken,
  )
  return {
    schemaVersion: LATEX_SYNTAX_SCHEMA_VERSION,
    fileId: document.fileId,
    path: document.path,
    documentVersion: document.documentVersion,
    mathRegions,
    macros: macroEvents(document, symbols),
    includes: includes(document, symbols),
    diagnostics,
    ...documentSyntax,
  }
}

const SECTION_RANK = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
} as const

type ProseArgumentKind = 'optional' | 'required'

const NON_PROSE_COMMAND_GROUPS = new Map<string, readonly ProseArgumentKind[]>([
  ['addbibresource', ['optional', 'required']],
  ['begin', ['required']],
  ['bibliography', ['required']],
  ['bibliographystyle', ['required']],
  ['cite', ['optional', 'optional', 'required']],
  ['citep', ['optional', 'optional', 'required']],
  ['citet', ['optional', 'optional', 'required']],
  ['documentclass', ['optional', 'required']],
  ['end', ['required']],
  ['include', ['required']],
  ['includegraphics', ['optional', 'required']],
  ['input', ['required']],
  ['label', ['required']],
  ['newacronym', ['optional', 'required', 'required', 'required']],
  ['newcommand', ['required', 'optional', 'optional', 'required']],
  ['newenvironment', ['required', 'optional', 'optional', 'required', 'required']],
  ['newglossaryentry', ['required', 'required']],
  ['pageref', ['required']],
  ['providecommand', ['required', 'optional', 'optional', 'required']],
  ['ref', ['required']],
  ['renewcommand', ['required', 'optional', 'optional', 'required']],
  ['renewenvironment', ['required', 'optional', 'optional', 'required', 'required']],
  ['subfile', ['required']],
  ['usepackage', ['optional', 'required']],
  ['DeclareMathOperator', ['required', 'required']],
  ['DeclarePairedDelimiter', ['required', 'required']],
])

const CITATION_COMMANDS = new Set(CITE_CMDS.split('|'))
const CITATION_ARGUMENTS: readonly ProseArgumentKind[] = ['optional', 'optional', 'required']
const DOCUMENT_FIELD_COMMANDS = new Set(['title', 'author', 'keywords'] as const)
for (const command of CITATION_COMMANDS) {
  NON_PROSE_COMMAND_GROUPS.set(command, CITATION_ARGUMENTS)
}
for (const command of DOCUMENT_FIELD_COMMANDS) {
  NON_PROSE_COMMAND_GROUPS.set(command, ['required'])
}

function buildDocumentSyntax(
  document: LatexDocumentInput,
  tokens: readonly Token[],
  symbols: FileSymbols,
  mathRegions: readonly LatexMathRegion[],
  cancellationToken?: LatexSyntaxCancellationToken,
): LatexDocumentSyntaxSnapshot {
  const tokensByStart = new Map(tokens.map((token) => [token.start, token]))
  return {
    ...buildNotationCst(document, tokens, mathRegions, () =>
      throwIfSyntaxCancelled(cancellationToken),
    ),
    visibleProse: visibleProseSpans(document, tokens, mathRegions),
    proseAnnotations: proseAnnotations(document, tokens),
    scopes: syntaxScopes(document, tokens, tokensByStart, symbols),
    declarations: structuralDeclarations(document, tokens, tokensByStart, symbols),
  }
}

function syntaxSourceRef(
  document: LatexDocumentInput,
  range: LatexSyntaxRange,
): LatexSyntaxSourceRef {
  return { fileId: document.fileId, path: document.path, range }
}

function visibleProseSpans(
  document: LatexDocumentInput,
  tokens: readonly Token[],
  mathRegions: readonly LatexMathRegion[],
): LatexVisibleProseSpan[] {
  const excluded: Array<readonly [number, number]> = [
    ...conditionalMaskSpans(tokens, document.content.length),
    ...(document.language === 'markdown' ? markdownExcludedSpans(document.content) : []),
    ...mathRegions.map(
      (region) => [region.fullRange.startOffset, region.fullRange.endOffset] as const,
    ),
  ]
  for (const token of tokens) {
    if (
      token.type === 'comment' ||
      token.type === 'verb' ||
      token.type === 'open' ||
      token.type === 'close'
    ) {
      excluded.push([token.start, token.end])
    } else if (token.type === 'command') {
      const groups = NON_PROSE_COMMAND_GROUPS.get(token.value)
      excluded.push([
        token.start,
        groups === undefined
          ? token.end
          : scanCommandInvocation(document.content, token.end, groups).end,
      ])
    }
  }

  const spans: LatexVisibleProseSpan[] = []
  let cursor = 0
  for (const [start, end] of mergeSpans(excluded, document.content.length)) {
    pushVisibleProse(document.content, cursor, start, spans)
    cursor = Math.max(cursor, end)
  }
  pushVisibleProse(document.content, cursor, document.content.length, spans)
  return spans
}

interface ScannedCommandInvocation {
  end: number
  complete: boolean
}

function scanCommandInvocation(
  source: string,
  commandEnd: number,
  groups: readonly ProseArgumentKind[],
): ScannedCommandInvocation {
  let cursor = commandEnd
  if (source[cursor] === '*') cursor++
  for (const group of groups) {
    while (/\s/.test(source[cursor] ?? '')) cursor++
    const scanned = scanCommandGroup(source, cursor, group)
    if (scanned === null) continue
    cursor = scanned.end
    if (!scanned.complete) return scanned
  }
  return { end: cursor, complete: true }
}

function scanCommandGroup(
  source: string,
  cursor: number,
  group: ProseArgumentKind,
): ScannedCommandInvocation | null {
  if (group === 'optional') {
    return source[cursor] === '[' ? balancedDelimiter(source, cursor, '[', ']') : null
  }
  return source[cursor] === '{'
    ? balancedDelimiter(source, cursor, '{', '}')
    : { end: cursor, complete: false }
}

function balancedDelimiter(
  source: string,
  start: number,
  open: string,
  close: string,
): ScannedCommandInvocation {
  let depth = 0
  for (let cursor = start; cursor < source.length; cursor++) {
    if (source[cursor] === '\\') {
      cursor++
      continue
    }
    if (source[cursor] === open) depth++
    else if (source[cursor] === close && --depth === 0) {
      return { end: cursor + 1, complete: true }
    }
  }
  return { end: source.length, complete: false }
}

function proseAnnotations(
  document: LatexDocumentInput,
  tokens: readonly Token[],
): LatexProseAnnotation[] {
  const annotations: LatexProseAnnotation[] = []
  for (const token of tokens) {
    if (token.type !== 'command') continue
    if (CITATION_COMMANDS.has(token.value)) {
      const invocation = scanCommandInvocation(document.content, token.end, CITATION_ARGUMENTS)
      annotations.push({
        kind: 'citation',
        name: token.value,
        range: { startOffset: token.start, endOffset: invocation.end },
        state: invocation.complete ? 'complete' : 'incomplete',
      })
      continue
    }
    if (isDocumentFieldCommand(token.value)) {
      annotations.push(documentFieldAnnotation(document, token))
    }
  }
  return annotations
}

function isDocumentFieldCommand(value: string): value is 'title' | 'author' | 'keywords' {
  return DOCUMENT_FIELD_COMMANDS.has(value as 'title' | 'author' | 'keywords')
}

function documentFieldAnnotation(document: LatexDocumentInput, token: Token): LatexProseAnnotation {
  let cursor = token.end
  while (/\s/.test(document.content[cursor] ?? '')) cursor++
  if (document.content[cursor] !== '{') {
    return {
      kind: 'document-field',
      name: token.value as 'title' | 'author' | 'keywords',
      range: { startOffset: token.start, endOffset: token.end },
      state: 'incomplete',
    }
  }
  const group = balancedDelimiter(document.content, cursor, '{', '}')
  return {
    kind: 'document-field',
    name: token.value as 'title' | 'author' | 'keywords',
    range: { startOffset: token.start, endOffset: group.end },
    valueRange: {
      startOffset: cursor + 1,
      endOffset: Math.max(cursor + 1, group.end - (group.complete ? 1 : 0)),
    },
    state: group.complete ? 'complete' : 'incomplete',
  }
}

function mergeSpans(
  spans: readonly (readonly [number, number])[],
  sourceLength: number,
): Array<readonly [number, number]> {
  const ordered = spans
    .map(
      ([start, end]) =>
        [
          Math.max(0, Math.min(start, sourceLength)),
          Math.max(0, Math.min(end, sourceLength)),
        ] as const,
    )
    .filter(([start, end]) => end > start)
    .sort((left, right) => left[0] - right[0] || left[1] - right[1])
  const merged: Array<[number, number]> = []
  for (const [start, end] of ordered) {
    const previous = merged[merged.length - 1]
    if (!previous || start > previous[1]) merged.push([start, end])
    else previous[1] = Math.max(previous[1], end)
  }
  return merged
}

function pushVisibleProse(
  source: string,
  start: number,
  end: number,
  spans: LatexVisibleProseSpan[],
): void {
  while (start < end && /\s/.test(source[start]!)) start++
  while (end > start && /\s/.test(source[end - 1]!)) end--
  if (end > start) spans.push({ range: { startOffset: start, endOffset: end }, state: 'complete' })
}

function syntaxScopes(
  document: LatexDocumentInput,
  tokens: readonly Token[],
  tokensByStart: ReadonlyMap<number, Token>,
  symbols: FileSymbols,
): LatexSyntaxScope[] {
  const scopes: LatexSyntaxScope[] = [
    {
      kind: 'document',
      parent: null,
      range: { startOffset: 0, endOffset: document.content.length },
      state: 'complete',
    },
  ]
  if (document.language === 'markdown') appendMarkdownSectionScopes(scopes, document)
  else appendSectionScopes(scopes, document, tokensByStart, symbols)
  appendEnvironmentScopes(scopes, document, tokens)
  return scopes
}

interface MarkdownSection {
  depth: number
  name: string
  sourceEnd: number
  start: number
}

function appendMarkdownSectionScopes(
  scopes: LatexSyntaxScope[],
  document: LatexDocumentInput,
): void {
  const sections = markdownSections(document.content)
  const sectionIndices: number[] = []
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!
    const end =
      sections.slice(index + 1).find((candidate) => candidate.depth <= section.depth)?.start ??
      document.content.length
    let parent = 0
    for (let previous = index - 1; previous >= 0; previous--) {
      if (sections[previous]!.depth < section.depth) {
        parent = sectionIndices[previous]!
        break
      }
    }
    sectionIndices.push(scopes.length)
    scopes.push({
      kind: 'section',
      parent,
      range: { startOffset: section.start, endOffset: end },
      state: 'complete',
      name: section.name,
      source: syntaxSourceRef(document, {
        startOffset: section.start,
        endOffset: section.sourceEnd,
      }),
    })
  }
}

function markdownSections(source: string): MarkdownSection[] {
  const excluded = markdownExcludedSpans(source)
  const lines = markdownLines(source)
  const sections: MarkdownSection[] = []
  for (let index = 0; index < lines.length; index++) {
    const [start, line] = lines[index]!
    if (inside(start, excluded)) continue
    const atx = parseAtxHeading(line)
    if (atx) {
      sections.push({
        depth: atx.depth,
        name: atx.name,
        sourceEnd: start + line.length,
        start,
      })
      continue
    }
    const setextDepth = setextHeadingDepth(line)
    const previous = lines[index - 1]
    if (!setextDepth || !previous || inside(previous[0], excluded) || !previous[1].trim()) continue
    sections.push({
      depth: setextDepth,
      name: previous[1].trim(),
      sourceEnd: start + line.length,
      start: previous[0],
    })
  }
  return sections
}

function parseAtxHeading(line: string): { depth: number; name: string } | null {
  let offset = 0
  while (offset < line.length && line[offset] === ' ') offset++
  if (offset > 3) return null
  const markerStart = offset
  while (offset < line.length && line[offset] === '#' && offset - markerStart < 6) offset++
  const depth = offset - markerStart
  if (
    depth === 0 ||
    line[offset] === '#' ||
    (line[offset] !== undefined && !/[ \t]/.test(line[offset]!))
  ) {
    return null
  }
  let name = line.slice(offset).trim()
  let closingStart = name.length
  while (closingStart > 0 && name[closingStart - 1] === '#') closingStart--
  if (closingStart < name.length && closingStart > 0 && /[ \t]/.test(name[closingStart - 1]!)) {
    name = name.slice(0, closingStart).trimEnd()
  }
  return { depth, name }
}

function setextHeadingDepth(line: string): number | null {
  let offset = 0
  while (offset < line.length && line[offset] === ' ') offset++
  if (offset > 3 || (line[offset] !== '=' && line[offset] !== '-')) return null
  const marker = line[offset]
  let markers = 0
  while (offset < line.length && line[offset] === marker) {
    markers++
    offset++
  }
  if (markers === 0) return null
  while (offset < line.length && (line[offset] === ' ' || line[offset] === '\t')) offset++
  return offset === line.length ? (marker === '=' ? 1 : 2) : null
}

function appendSectionScopes(
  scopes: LatexSyntaxScope[],
  document: LatexDocumentInput,
  tokensByStart: ReadonlyMap<number, Token>,
  symbols: FileSymbols,
): void {
  const lineStarts = buildLineStarts(document.content)
  const sections = symbols.sections
    .map((section) => ({
      level: section.level,
      offset: offsetAt(lineStarts, section.location),
      name: section.title,
    }))
    .sort((left, right) => left.offset - right.offset)
  const sectionIndices: number[] = []
  for (let index = 0; index < sections.length; index++) {
    const section = sections[index]!
    let end = document.content.length
    for (let next = index + 1; next < sections.length; next++) {
      if (SECTION_RANK[sections[next]!.level] <= SECTION_RANK[section.level]) {
        end = sections[next]!.offset
        break
      }
    }
    let parent = 0
    for (let previous = index - 1; previous >= 0; previous--) {
      if (SECTION_RANK[sections[previous]!.level] < SECTION_RANK[section.level]) {
        parent = sectionIndices[previous]!
        break
      }
    }
    const token = tokensByStart.get(section.offset)
    sectionIndices.push(scopes.length)
    scopes.push({
      kind: 'section',
      parent,
      range: { startOffset: section.offset, endOffset: end },
      state: 'complete',
      name: section.name,
      level: section.level,
      source: syntaxSourceRef(document, {
        startOffset: section.offset,
        endOffset: token?.end ?? section.offset,
      }),
    })
  }
}

function appendEnvironmentScopes(
  scopes: LatexSyntaxScope[],
  document: LatexDocumentInput,
  tokens: readonly Token[],
): void {
  const environmentStack: Array<{ index: number; name: string }> = []
  for (const token of tokens) {
    const environment = environmentAt(document.content, token)
    if (!environment) continue
    if (environment.kind === 'begin') {
      const parent =
        environmentStack[environmentStack.length - 1]?.index ??
        deepestContainingSection(scopes, token.start)
      const index = scopes.length
      scopes.push({
        kind: 'environment',
        parent,
        range: { startOffset: token.start, endOffset: document.content.length },
        state: 'incomplete',
        name: environment.name,
        source: syntaxSourceRef(document, {
          startOffset: token.start,
          endOffset: environment.end,
        }),
      })
      environmentStack.push({ index, name: environment.name })
      continue
    }
    const match = findOpenEnvironment(environmentStack, environment.name)
    if (match < 0) continue
    closeEnvironmentScope(scopes, environmentStack, match, environment.name, environment.end)
  }
}

function findOpenEnvironment(
  stack: readonly { index: number; name: string }[],
  name: string,
): number {
  for (let index = stack.length - 1; index >= 0; index--) {
    if (stack[index]!.name === name) return index
  }
  return -1
}

function closeEnvironmentScope(
  scopes: LatexSyntaxScope[],
  stack: Array<{ index: number; name: string }>,
  match: number,
  name: string,
  endOffset: number,
): void {
  while (stack.length > match) {
    const entry = stack.pop()!
    if (entry.name !== name) continue
    const scope = scopes[entry.index]!
    scopes[entry.index] = {
      ...scope,
      range: { ...scope.range, endOffset },
      state: 'complete',
    }
  }
}

function deepestContainingSection(scopes: readonly LatexSyntaxScope[], offset: number): number {
  for (let index = scopes.length - 1; index > 0; index--) {
    const scope = scopes[index]!
    if (
      scope.kind === 'section' &&
      scope.range.startOffset <= offset &&
      offset < scope.range.endOffset
    )
      return index
  }
  return 0
}

function structuralDeclarations(
  document: LatexDocumentInput,
  tokens: readonly Token[],
  tokensByStart: ReadonlyMap<number, Token>,
  symbols: FileSymbols,
): LatexStructuralDeclaration[] {
  const rich = collectRichStructuralDeclarations(document, tokens)
  const richMacroNames = new Set(
    rich
      .filter(
        (declaration) =>
          declaration.kind === 'macro' ||
          declaration.kind === 'operator' ||
          declaration.kind === 'paired-delimiter',
      )
      .map((declaration) => declaration.name),
  )
  const lineStarts = buildLineStarts(document.content)
  const atCommand = (location: SourceLocation): LatexSyntaxSourceRef => {
    const offset = offsetAt(lineStarts, location)
    const token = tokensByStart.get(offset)
    return syntaxSourceRef(document, {
      startOffset: offset,
      endOffset: token?.end ?? offset,
    })
  }
  const atName = (location: SourceLocation, name: string): LatexSyntaxSourceRef => {
    const offset = offsetAt(lineStarts, location)
    return syntaxSourceRef(document, { startOffset: offset, endOffset: offset + name.length })
  }
  return [
    ...symbols.classes.map((value) => ({
      kind: 'class' as const,
      name: value.name,
      options: value.options,
      source: atCommand(value.location),
    })),
    ...symbols.packages.map((value) => ({
      kind: 'package' as const,
      name: value.name,
      options: value.options,
      source: atCommand(value.location),
    })),
    ...symbols.commands
      .filter((value) => !richMacroNames.has(value.name))
      .map((value) => ({
        kind: 'macro' as const,
        name: value.name,
        source: atName(value.location, value.name),
      })),
    ...symbols.environmentDefs.map((value) => ({
      kind: 'environment' as const,
      name: value.name,
      source: atCommand(value.location),
    })),
    ...rich,
  ]
}

function offsetAt(lineStarts: readonly number[], location: SourceLocation): number {
  return (lineStarts[location.line - 1] ?? 0) + location.column - 1
}

function wireBytes(value: unknown): number {
  return UTF8_ENCODER.encode(JSON.stringify(value)).byteLength
}

function throwIfSyntaxCancelled(token?: LatexSyntaxCancellationToken): void {
  if (token?.isCancellationRequested) throw new LatexSyntaxCancelledError('Syntax update cancelled')
}

function syntaxWireBytes(syntaxes: readonly LatexFileSyntax[]): number {
  return syntaxes.reduce((total, syntax) => total + wireBytes(syntax), 0)
}

function isRecoveredNotationNode(node: LatexNotationNode): boolean {
  return (
    node.kind === 'error' ||
    node.state === 'incomplete' ||
    node.state === 'ambiguous' ||
    node.state === 'cyclic' ||
    node.state === 'truncated'
  )
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
                ...compositeNotation(expanded.surface),
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
