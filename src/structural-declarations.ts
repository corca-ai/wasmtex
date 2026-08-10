import { NEWCMD_CMDS } from './lsp/latex-patterns'
import type { Token } from './lsp/latex-tokenizer'
import type {
  LatexStructuralDeclaration,
  LatexStructuralField,
  LatexSyntaxRange,
  LatexSyntaxSourceRef,
} from './syntax-contract'

interface DeclarationDocument {
  fileId: string
  path: string
  content: string
}

interface InvocationGroup {
  syntax: 'required' | 'optional'
  range: LatexSyntaxRange
  contentRange: LatexSyntaxRange
  text: string
  complete: boolean
}

interface Invocation {
  starred: boolean
  groups: readonly InvocationGroup[]
  range: LatexSyntaxRange
  complete: boolean
}

const MACRO_DECLARATIONS = new Set(NEWCMD_CMDS.split('|'))
type DeclarationCollector = (
  document: DeclarationDocument,
  token: Token,
) => LatexStructuralDeclaration | null
const DECLARATION_COLLECTORS = new Map<string, DeclarationCollector>([
  ['DeclareMathOperator', collectOperator],
  ['DeclarePairedDelimiter', collectPairedDelimiter],
  ['newglossaryentry', collectGlossary],
  ['longnewglossaryentry', collectGlossary],
  ['newacronym', collectAcronym],
])

export function collectRichStructuralDeclarations(
  document: DeclarationDocument,
  tokens: readonly Token[],
): LatexStructuralDeclaration[] {
  const declarations: LatexStructuralDeclaration[] = []
  for (const token of tokens) {
    if (token.type !== 'command') continue
    const collector = MACRO_DECLARATIONS.has(token.value)
      ? collectMacro
      : DECLARATION_COLLECTORS.get(token.value)
    const declaration = collector?.(document, token)
    if (declaration) declarations.push(declaration)
  }
  return declarations
}

function collectMacro(
  document: DeclarationDocument,
  token: Token,
): LatexStructuralDeclaration | null {
  const invocation = readInvocation(document.content, token)
  const required = requiredGroups(invocation)
  const optional = invocation.groups.filter((group) => group.syntax === 'optional')
  const name = commandName(required[0]?.text)
  if (!name) return null
  const body = required[1]
  const parameters = optional[0]?.text.trim()
  return {
    kind: 'macro',
    name,
    ...(parameters === undefined || !/^\d+$/.test(parameters)
      ? {}
      : { parameters: Number.parseInt(parameters, 10) }),
    ...(optional[1] === undefined ? {} : { optionalDefault: optional[1].text }),
    ...(body === undefined
      ? {}
      : { body: body.text, bodySource: sourceRef(document, body.contentRange) }),
    source: sourceRef(document, invocation.range),
    state: invocation.complete && body !== undefined ? 'complete' : 'incomplete',
  }
}

function collectOperator(
  document: DeclarationDocument,
  token: Token,
): LatexStructuralDeclaration | null {
  const named = namedInvocation(document, token)
  if (!named) return null
  const { invocation, name, required, source, nameSource } = named
  return {
    kind: 'operator',
    name,
    surface: required[1]?.text.trim() ?? '',
    limits: invocation.starred,
    source,
    nameSource,
    surfaceSource: sourceRef(
      document,
      required[1]?.contentRange ?? emptyRange(invocation.range.endOffset),
    ),
    state: invocation.complete && required.length >= 2 ? 'complete' : 'incomplete',
  }
}

function collectPairedDelimiter(
  document: DeclarationDocument,
  token: Token,
): LatexStructuralDeclaration | null {
  const named = namedInvocation(document, token)
  if (!named) return null
  const { invocation, name, required, source, nameSource } = named
  return {
    kind: 'paired-delimiter',
    name,
    left: required[1]?.text.trim() ?? '',
    right: required[2]?.text.trim() ?? '',
    source,
    nameSource,
    state: invocation.complete && required.length >= 3 ? 'complete' : 'incomplete',
  }
}

function collectGlossary(
  document: DeclarationDocument,
  token: Token,
): LatexStructuralDeclaration | null {
  const keyed = keyedInvocation(document, token)
  if (!keyed) return null
  const { invocation, key, keySource, optional, required, source } = keyed
  return {
    kind: 'glossary',
    key,
    options: optional ? parseFields(document, optional) : [],
    fields: required[1] ? parseFields(document, required[1]) : [],
    source,
    keySource,
    state: invocation.complete && required.length >= 2 ? 'complete' : 'incomplete',
  }
}

function collectAcronym(
  document: DeclarationDocument,
  token: Token,
): LatexStructuralDeclaration | null {
  const keyed = keyedInvocation(document, token)
  if (!keyed) return null
  const { invocation, key, keySource, optional, required, source } = keyed
  return {
    kind: 'acronym',
    key,
    short: required[1]?.text.trim() ?? '',
    long: required[2]?.text.trim() ?? '',
    options: optional ? parseFields(document, optional) : [],
    source,
    keySource,
    shortSource: sourceRef(
      document,
      required[1]?.contentRange ?? emptyRange(invocation.range.endOffset),
    ),
    longSource: sourceRef(
      document,
      required[2]?.contentRange ?? emptyRange(invocation.range.endOffset),
    ),
    state: invocation.complete && required.length >= 3 ? 'complete' : 'incomplete',
  }
}

function namedInvocation(
  document: DeclarationDocument,
  token: Token,
): {
  invocation: Invocation
  required: InvocationGroup[]
  name: string
  source: LatexSyntaxSourceRef
  nameSource: LatexSyntaxSourceRef
} | null {
  const invocation = readInvocation(document.content, token)
  const required = requiredGroups(invocation)
  const name = commandName(required[0]?.text)
  if (!name) return null
  return {
    invocation,
    required,
    name,
    source: sourceRef(document, invocation.range),
    nameSource: sourceRef(document, required[0]!.contentRange),
  }
}

function keyedInvocation(
  document: DeclarationDocument,
  token: Token,
): {
  invocation: Invocation
  required: InvocationGroup[]
  key: string
  optional: InvocationGroup | undefined
  source: LatexSyntaxSourceRef
  keySource: LatexSyntaxSourceRef
} | null {
  const invocation = readInvocation(document.content, token)
  const required = requiredGroups(invocation)
  const key = required[0]?.text.trim()
  if (!key) return null
  return {
    invocation,
    required,
    key,
    optional: invocation.groups.find((group) => group.syntax === 'optional'),
    source: sourceRef(document, invocation.range),
    keySource: sourceRef(document, required[0]!.contentRange),
  }
}

function requiredGroups(invocation: Invocation): InvocationGroup[] {
  return invocation.groups.filter((group) => group.syntax === 'required')
}

function readInvocation(source: string, token: Token): Invocation {
  let cursor = token.end
  let starred = false
  if (source[cursor] === '*') {
    starred = true
    cursor++
  }
  const groups: InvocationGroup[] = []
  for (let count = 0; count < 8; count++) {
    while (/\s/.test(source[cursor] ?? '')) cursor++
    const open = source[cursor]
    if (open !== '{' && open !== '[') break
    const parsed = readGroup(source, cursor)
    groups.push(parsed)
    cursor = parsed.range.endOffset
    if (!parsed.complete) break
  }
  return {
    starred,
    groups,
    range: { startOffset: token.start, endOffset: cursor },
    complete: groups.every((group) => group.complete),
  }
}

function readGroup(source: string, start: number): InvocationGroup {
  const open = source[start]!
  const stack = [open === '{' ? '}' : ']']
  for (let cursor = start + 1; cursor < source.length; cursor++) {
    const character = source[cursor]!
    if (character === '\\') {
      cursor++
      continue
    }
    if (updateDelimiterStack(character, stack)) {
      return {
        syntax: open === '{' ? 'required' : 'optional',
        range: { startOffset: start, endOffset: cursor + 1 },
        contentRange: { startOffset: start + 1, endOffset: cursor },
        text: source.slice(start + 1, cursor),
        complete: true,
      }
    }
  }
  return {
    syntax: open === '{' ? 'required' : 'optional',
    range: { startOffset: start, endOffset: source.length },
    contentRange: { startOffset: start + 1, endOffset: source.length },
    text: source.slice(start + 1),
    complete: false,
  }
}

function updateDelimiterStack(character: string, stack: string[]): boolean {
  if (character === '{') stack.push('}')
  else if (character === '[') stack.push(']')
  else if (character === stack[stack.length - 1]) stack.pop()
  return stack.length === 0
}

function parseFields(
  document: DeclarationDocument,
  group: InvocationGroup,
): LatexStructuralField[] {
  const fields: LatexStructuralField[] = []
  for (const [rawStart, rawEnd] of topLevelSegments(group.text)) {
    const start = trimStart(group.text, rawStart, rawEnd)
    const end = trimEnd(group.text, start, rawEnd)
    if (end <= start) continue
    const equals = topLevelEquals(group.text, start, end)
    const nameEnd = equals < 0 ? end : trimEnd(group.text, start, equals)
    const valueStart = equals < 0 ? end : trimStart(group.text, equals + 1, end)
    const valueEnd = trimEnd(group.text, valueStart, end)
    const name = group.text.slice(start, nameEnd)
    if (!name) continue
    fields.push({
      name,
      value: unwrapBraces(group.text.slice(valueStart, valueEnd)),
      source: sourceRef(document, {
        startOffset: group.contentRange.startOffset + start,
        endOffset: group.contentRange.startOffset + end,
      }),
    })
  }
  return fields
}

function topLevelSegments(text: string): Array<readonly [number, number]> {
  const result: Array<readonly [number, number]> = []
  let start = 0
  for (const cursor of topLevelPositions(text, 0, text.length, ',')) {
    result.push([start, cursor])
    start = cursor + 1
  }
  result.push([start, text.length])
  return result
}

function topLevelEquals(text: string, start: number, end: number): number {
  return topLevelPositions(text, start, end, '=')[0] ?? -1
}

function topLevelPositions(text: string, start: number, end: number, target: string): number[] {
  const positions: number[] = []
  const stack: string[] = []
  for (let cursor = start; cursor < end; cursor++) {
    const character = text[cursor]!
    if (character === '\\') {
      cursor++
      continue
    }
    if (character === '{') stack.push('}')
    else if (character === '[') stack.push(']')
    else if (character === stack[stack.length - 1]) stack.pop()
    else if (character === target && stack.length === 0) positions.push(cursor)
  }
  return positions
}

function trimStart(text: string, start: number, end: number): number {
  while (start < end && /\s/.test(text[start]!)) start++
  return start
}

function trimEnd(text: string, start: number, end: number): number {
  while (end > start && /\s/.test(text[end - 1]!)) end--
  return end
}

function unwrapBraces(value: string): string {
  return value.startsWith('{') && value.endsWith('}') ? value.slice(1, -1) : value
}

function commandName(value: string | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed?.startsWith('\\')) return null
  const name = trimmed.slice(1)
  return /^[A-Za-z@]+$/.test(name) ? name : null
}

function sourceRef(document: DeclarationDocument, range: LatexSyntaxRange): LatexSyntaxSourceRef {
  return { fileId: document.fileId, path: document.path, range }
}

function emptyRange(offset: number): LatexSyntaxRange {
  return { startOffset: offset, endOffset: offset }
}
