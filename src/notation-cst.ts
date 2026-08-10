import type { Token } from './lsp/latex-tokenizer'
import type {
  LatexDocumentSyntaxSnapshot,
  LatexMathRoot,
  LatexNotationNode,
  LatexSyntaxNodeId,
  LatexSyntaxRange,
  LatexSyntaxSourceRef,
} from './syntax-contract'

interface NotationDocument {
  fileId: string
  path: string
  content: string
}

interface NotationMathRegion {
  delimiter: string
  fullRange: LatexSyntaxRange
  contentRange: LatexSyntaxRange
  closed: boolean
}

interface Lexeme {
  kind: 'command' | 'open' | 'close' | 'character'
  value: string
  range: LatexSyntaxRange
}

interface ParsedAtom {
  node: LatexSyntaxNodeId
  range: LatexSyntaxRange
}

interface RawGroup {
  range: LatexSyntaxRange
  innerRange: LatexSyntaxRange
  text: string
  endCursor: number
  complete: boolean
}

type StructuralCommandKind = 'modifier' | 'style' | 'named-operator'

const STRUCTURAL_COMMANDS = new Map<string, StructuralCommandKind>([
  ['bar', 'modifier'],
  ['ddot', 'modifier'],
  ['dot', 'modifier'],
  ['hat', 'modifier'],
  ['overline', 'modifier'],
  ['tilde', 'modifier'],
  ['underline', 'modifier'],
  ['vec', 'modifier'],
  ['widehat', 'modifier'],
  ['widetilde', 'modifier'],
  ['mathbf', 'style'],
  ['mathbb', 'style'],
  ['mathcal', 'style'],
  ['mathfrak', 'style'],
  ['mathit', 'style'],
  ['mathrm', 'style'],
  ['mathsf', 'style'],
  ['mathtt', 'style'],
  ['operatorname', 'named-operator'],
])

const MAX_DOCUMENT_NODES = 10_000
const MAX_PARSE_DEPTH = 128
const MAX_OPAQUE_ARGUMENTS = 8
const NODE_RESERVE = MAX_PARSE_DEPTH + 2

export function buildNotationCst(
  document: NotationDocument,
  tokens: readonly Token[],
  regions: readonly NotationMathRegion[],
  checkCancelled: () => void = () => undefined,
): { nodes: readonly LatexNotationNode[]; mathRoots: readonly LatexMathRoot[] } {
  const nodes: LatexNotationNode[] = []
  const mathRoots: LatexMathRoot[] = []
  let tokenCursor = 0
  for (const region of regions) {
    checkCancelled()
    const selected = selectRegionTokens(tokens, tokenCursor, region.contentRange, checkCancelled)
    tokenCursor = selected.cursor
    const parser = new NotationParser(
      document,
      lexemes(selected.tokens, region.contentRange, checkCancelled),
      nodes,
      checkCancelled,
    )
    const node = parser.parseRoot(region.contentRange)
    mathRoots.push({
      node,
      delimiter: region.delimiter,
      fullRange: region.fullRange,
      contentRange: region.contentRange,
      state: region.closed ? 'complete' : 'incomplete',
    })
  }
  return { nodes, mathRoots }
}

function selectRegionTokens(
  tokens: readonly Token[],
  initialCursor: number,
  range: LatexSyntaxRange,
  checkCancelled: () => void,
): { cursor: number; tokens: readonly Token[] } {
  let cursor = initialCursor
  while (tokens[cursor] && tokens[cursor]!.end <= range.startOffset) cursor++
  const selected: Token[] = []
  for (let index = cursor; index < tokens.length; index++) {
    if ((index & 255) === 0) checkCancelled()
    const token = tokens[index]!
    if (token.start >= range.endOffset) break
    if (token.end > range.startOffset) selected.push(token)
  }
  return { cursor, tokens: selected }
}

/** Locate the source path without serializing a second interval tree. */
export function findLatexNotationPath(
  snapshot: Pick<LatexDocumentSyntaxSnapshot, 'mathRoots' | 'nodes'>,
  offset: number,
): readonly LatexSyntaxNodeId[] {
  const root = containingIndex(snapshot.mathRoots, offset, (candidate) => candidate.contentRange)
  if (root < 0) return []
  const path: LatexSyntaxNodeId[] = [snapshot.mathRoots[root]!.node]
  for (;;) {
    const parent = snapshot.nodes[path[path.length - 1]!]
    if (!parent) return path
    const child = containingIndex(
      parent.children,
      offset,
      (node) => snapshot.nodes[node]!.ranges.full,
    )
    if (child < 0) return path
    path.push(parent.children[child]!)
  }
}

class NotationParser {
  private cursor = 0
  private operations = 0

  constructor(
    private readonly document: NotationDocument,
    private readonly input: readonly Lexeme[],
    private readonly nodes: LatexNotationNode[],
    private readonly checkCancelled: () => void,
  ) {}

  parseRoot(range: LatexSyntaxRange): LatexSyntaxNodeId {
    const children = this.parseSequence(0)
    return this.addNode({ kind: 'sequence', children, range, state: 'complete' })
  }

  private parseSequence(depth: number, closing?: string): LatexSyntaxNodeId[] {
    const children: LatexSyntaxNodeId[] = []
    while (this.cursor < this.input.length) {
      this.checkpoint()
      const current = this.input[this.cursor]!
      if (current.kind === 'close' && closing === '}') break
      if (current.kind === 'character' && current.value === closing) break
      if (current.kind === 'character' && (current.value === '_' || current.value === '^')) {
        this.attachScript(children, depth)
        continue
      }
      const atom = this.parseAtom(depth)
      if (atom) children.push(atom.node)
    }
    return children
  }

  private parseAtom(depth: number): ParsedAtom | null {
    const current = this.input[this.cursor]
    if (!current) return null
    if (this.nodes.length >= MAX_DOCUMENT_NODES - NODE_RESERVE) {
      const range = {
        startOffset: current.range.startOffset,
        endOffset: this.input[this.input.length - 1]?.range.endOffset ?? current.range.endOffset,
      }
      this.cursor = this.input.length
      return this.opaque(range, 'truncated')
    }
    if (depth >= MAX_PARSE_DEPTH) {
      this.cursor++
      return this.opaque(current.range, 'truncated')
    }
    if (current.kind === 'open') return this.parseGroup(depth + 1)
    if (current.kind === 'close') return this.unexpectedClose(current)
    if (current.kind === 'command') return this.parseCommand(depth + 1)
    if (current.value === '(' || current.value === '[') return this.parseDelimiter(depth + 1)
    this.cursor++
    if (current.value === '&' || current.value === '\\') {
      return this.atom('alignment', current.range, current.value)
    }
    return this.atom('token', current.range, current.value)
  }

  private parseGroup(depth: number): ParsedAtom {
    const open = this.input[this.cursor++]!
    const children = this.parseSequence(depth, '}')
    const close = this.input[this.cursor]
    const complete = close?.kind === 'close'
    if (complete) this.cursor++
    return this.container('group', open, children, complete ? close.range.endOffset : undefined)
  }

  private parseDelimiter(depth: number): ParsedAtom {
    const open = this.input[this.cursor++]!
    const closing = open.value === '(' ? ')' : ']'
    const children = this.parseSequence(depth, closing)
    const close = this.input[this.cursor]
    const complete = close?.kind === 'character' && close.value === closing
    if (complete) this.cursor++
    return this.container(
      'delimiter',
      open,
      children,
      complete ? close.range.endOffset : undefined,
      complete ? `${open.value}${closing}` : open.value,
    )
  }

  private container(
    kind: 'delimiter' | 'group',
    open: Lexeme,
    children: readonly LatexSyntaxNodeId[],
    closeEnd?: number,
    name?: string,
  ): ParsedAtom {
    const range = {
      startOffset: open.range.startOffset,
      endOffset: closeEnd ?? this.lastEnd(open.range.endOffset, children),
    }
    const node = this.addNode({
      kind,
      children,
      range,
      state: closeEnd === undefined ? 'incomplete' : 'complete',
      ...(name === undefined ? {} : { name }),
    })
    return { node, range }
  }

  private parseCommand(depth: number): ParsedAtom {
    const command = this.input[this.cursor++]!
    if (command.value === '\\') return this.atom('alignment', command.range, command.value)
    if (command.value === 'begin') return this.parseEnvironment(command, depth)
    const structural = STRUCTURAL_COMMANDS.get(command.value)
    if (structural) return this.parseStructuralCommand(command, structural, depth)
    const children: LatexSyntaxNodeId[] = []
    for (let count = 0; count < MAX_OPAQUE_ARGUMENTS; count++) {
      const next = this.input[this.cursor]
      if (next?.kind !== 'open') break
      children.push(this.parseGroup(depth).node)
    }
    const range = {
      startOffset: command.range.startOffset,
      endOffset: this.lastEnd(command.range.endOffset, children),
    }
    const node = this.addNode({
      kind: 'command',
      children,
      range,
      state: 'opaque',
      name: command.value,
      command: command.range,
      nameRange: commandNameRange(command),
    })
    return { node, range }
  }

  private parseStructuralCommand(
    command: Lexeme,
    kind: StructuralCommandKind,
    depth: number,
  ): ParsedAtom {
    const star =
      kind === 'named-operator' && this.input[this.cursor]?.value === '*'
        ? this.input[this.cursor++]
        : undefined
    const argument = this.parseAtom(depth)
    const children = argument ? [argument.node] : []
    const range = {
      startOffset: command.range.startOffset,
      endOffset: argument?.range.endOffset ?? star?.range.endOffset ?? command.range.endOffset,
    }
    const nameRange =
      kind === 'named-operator' && argument
        ? innerRange(this.nodes[argument.node]!, argument.range)
        : commandNameRange(command)
    const node = this.addNode({
      kind,
      children,
      range,
      state: argument ? 'complete' : 'incomplete',
      name:
        kind === 'named-operator' && argument
          ? this.document.content.slice(nameRange.startOffset, nameRange.endOffset)
          : command.value,
      command: {
        startOffset: command.range.startOffset,
        endOffset: star?.range.endOffset ?? command.range.endOffset,
      },
      nameRange,
      ...(argument ? { nucleus: argument.range } : {}),
    })
    return { node, range }
  }

  private parseEnvironment(command: Lexeme, depth: number): ParsedAtom {
    const opening = rawGroupAt(this.document.content, this.input, this.cursor)
    if (!opening) {
      const node = this.addNode({
        kind: 'environment',
        children: [],
        range: command.range,
        state: 'incomplete',
        command: command.range,
      })
      return { node, range: command.range }
    }
    this.cursor = opening.endCursor
    const children: LatexSyntaxNodeId[] = []
    let closing: RawGroup | null = null
    while (this.cursor < this.input.length) {
      closing = this.environmentEnd(opening.text)
      if (closing) {
        this.cursor = closing.endCursor
        break
      }
      const current = this.input[this.cursor]!
      if (current.kind === 'character' && (current.value === '_' || current.value === '^')) {
        this.attachScript(children, depth)
      } else {
        const atom = this.parseAtom(depth)
        if (atom) children.push(atom.node)
      }
    }
    const range = {
      startOffset: command.range.startOffset,
      endOffset: closing?.range.endOffset ?? this.lastEnd(opening.range.endOffset, children),
    }
    const node = this.addNode({
      kind: 'environment',
      children,
      range,
      state: closing ? 'complete' : 'incomplete',
      name: opening.text,
      command: command.range,
      nameRange: opening.innerRange,
    })
    return { node, range }
  }

  private environmentEnd(name: string): RawGroup | null {
    const command = this.input[this.cursor]
    if (command?.kind !== 'command' || command.value !== 'end') return null
    const group = rawGroupAt(this.document.content, this.input, this.cursor + 1)
    return group?.complete && group.text === name ? group : null
  }

  private attachScript(children: LatexSyntaxNodeId[], depth: number): void {
    const marker = this.input[this.cursor++]!
    const base = children.pop()
    const argument = this.parseAtom(depth + 1)
    if (base === undefined) {
      children.push(
        this.addNode({
          kind: 'error',
          children: argument ? [argument.node] : [],
          range: {
            startOffset: marker.range.startOffset,
            endOffset: argument?.range.endOffset ?? marker.range.endOffset,
          },
          state: 'incomplete',
          name: marker.value === '_' ? 'subscript' : 'superscript',
          command: marker.range,
        }),
      )
      return
    }
    const baseRange = this.nodes[base]!.ranges.full
    const range = {
      startOffset: baseRange.startOffset,
      endOffset: argument?.range.endOffset ?? marker.range.endOffset,
    }
    children.push(
      this.addNode({
        kind: 'script',
        children: argument ? [base, argument.node] : [base],
        range,
        state: argument ? 'complete' : 'incomplete',
        name: marker.value === '_' ? 'subscript' : 'superscript',
        command: marker.range,
        nucleus: baseRange,
      }),
    )
  }

  private unexpectedClose(lexeme: Lexeme): ParsedAtom {
    this.cursor++
    return this.atom('error', lexeme.range, lexeme.value, 'incomplete')
  }

  private atom(
    kind: LatexNotationNode['kind'],
    range: LatexSyntaxRange,
    text: string,
    state: LatexNotationNode['state'] = 'complete',
  ): ParsedAtom {
    return { node: this.addNode({ kind, children: [], range, state, text }), range }
  }

  private opaque(range: LatexSyntaxRange, state: 'truncated'): ParsedAtom {
    return { node: this.addNode({ kind: 'opaque', children: [], range, state }), range }
  }

  private addNode(input: {
    kind: LatexNotationNode['kind']
    children: readonly LatexSyntaxNodeId[]
    range: LatexSyntaxRange
    state: LatexNotationNode['state']
    name?: string
    text?: string
    command?: LatexSyntaxRange
    nameRange?: LatexSyntaxRange
    nucleus?: LatexSyntaxRange
  }): LatexSyntaxNodeId {
    const node = this.nodes.length
    const source = this.source(input.range)
    this.nodes.push({
      kind: input.kind,
      parent: null,
      children: input.children,
      ranges: {
        full: input.range,
        editable: input.range,
        ...(input.command ? { command: input.command } : {}),
        ...(input.nameRange ? { name: input.nameRange } : {}),
        ...(input.nucleus ? { nucleus: input.nucleus } : {}),
      },
      state: input.state,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.text === undefined ? {} : { text: input.text }),
      provenance: { origin: 'source', source, editable: true },
    })
    for (const child of input.children) this.nodes[child]!.parent = node
    return node
  }

  private source(range: LatexSyntaxRange): LatexSyntaxSourceRef {
    return { fileId: this.document.fileId, path: this.document.path, range }
  }

  private lastEnd(fallback: number, children: readonly LatexSyntaxNodeId[]): number {
    const last = children[children.length - 1]
    return last === undefined ? fallback : this.nodes[last]!.ranges.full.endOffset
  }

  private checkpoint(): void {
    if ((this.operations++ & 255) === 0) this.checkCancelled()
  }
}

function lexemes(
  tokens: readonly Token[],
  range: LatexSyntaxRange,
  checkCancelled: () => void,
): Lexeme[] {
  const result: Lexeme[] = []
  for (const [index, token] of tokens.entries()) {
    if ((index & 255) === 0) checkCancelled()
    const start = Math.max(token.start, range.startOffset)
    const end = Math.min(token.end, range.endOffset)
    if (end <= start || token.type === 'comment' || token.type === 'verb') continue
    if (token.type === 'command' || token.type === 'open' || token.type === 'close') {
      result.push({
        kind: token.type,
        value: token.value,
        range: { startOffset: start, endOffset: end },
      })
      continue
    }
    splitCharacters(token.value, token.start, range, result, checkCancelled)
  }
  return result
}

function splitCharacters(
  value: string,
  tokenStart: number,
  range: LatexSyntaxRange,
  result: Lexeme[],
  checkCancelled: () => void,
): void {
  let offset = tokenStart
  let index = 0
  for (const character of value) {
    if ((index++ & 255) === 0) checkCancelled()
    const endOffset = offset + character.length
    if (range.startOffset <= offset && endOffset <= range.endOffset && !/\s/u.test(character)) {
      result.push({
        kind: 'character',
        value: character,
        range: { startOffset: offset, endOffset },
      })
    }
    offset = endOffset
  }
}

function commandNameRange(command: Lexeme): LatexSyntaxRange {
  return {
    startOffset: Math.min(command.range.startOffset + 1, command.range.endOffset),
    endOffset: command.range.endOffset,
  }
}

function rawGroupAt(source: string, input: readonly Lexeme[], cursor: number): RawGroup | null {
  const open = input[cursor]
  if (open?.kind !== 'open') return null
  let depth = 1
  for (let index = cursor + 1; index < input.length; index++) {
    const lexeme = input[index]!
    if (lexeme.kind === 'open') depth++
    else if (lexeme.kind === 'close' && --depth === 0) {
      const innerRange = {
        startOffset: open.range.endOffset,
        endOffset: lexeme.range.startOffset,
      }
      return {
        range: { startOffset: open.range.startOffset, endOffset: lexeme.range.endOffset },
        innerRange,
        text: source.slice(innerRange.startOffset, innerRange.endOffset),
        endCursor: index + 1,
        complete: true,
      }
    }
  }
  const endOffset = input[input.length - 1]?.range.endOffset ?? open.range.endOffset
  const innerRange = { startOffset: open.range.endOffset, endOffset }
  return {
    range: { startOffset: open.range.startOffset, endOffset },
    innerRange,
    text: source.slice(innerRange.startOffset, innerRange.endOffset),
    endCursor: input.length,
    complete: false,
  }
}

function innerRange(node: LatexNotationNode, fallback: LatexSyntaxRange): LatexSyntaxRange {
  if (node.kind !== 'group') return fallback
  return {
    startOffset: Math.min(fallback.startOffset + 1, fallback.endOffset),
    endOffset: Math.max(
      fallback.startOffset,
      fallback.endOffset - (node.state === 'complete' ? 1 : 0),
    ),
  }
}

function containingIndex<T>(
  values: readonly T[],
  offset: number,
  rangeOf: (value: T) => LatexSyntaxRange,
): number {
  let low = 0
  let high = values.length - 1
  while (low <= high) {
    const middle = (low + high) >>> 1
    const range = rangeOf(values[middle]!)
    if (offset < range.startOffset) high = middle - 1
    else if (offset >= range.endOffset) low = middle + 1
    else return middle
  }
  return -1
}
