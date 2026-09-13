import { consumeRepairArguments } from './diagnostic-repair-arguments'
import type { LatexDiagnosticRepairEdit } from './diagnostic-repair-types'
import { isConditionalOpener } from './latex-parser'
import { getStructuralSelectionIndex } from './structural-selection'
import type { FileSymbols } from './types'

const CONTROL_GROUP_DELTA = new Map([
  ['begingroup', 1],
  ['bgroup', 1],
  ['endgroup', -1],
  ['egroup', -1],
])
const CONTROL_OPERAND_COUNTS = new Map([
  ['ifx', 2],
  ['newif', 1],
  ['ifdefined', 1],
])

/** Insert after the root class declaration, before preamble commands can execute. */
export function packagePreambleEdit(
  text: string,
  symbols: FileSymbols,
  root: string,
  packageName: string,
  beforeOffset?: number,
): LatexDiagnosticRepairEdit | null {
  if (text.length > 1_000_000 || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(packageName)) return null
  const index = getStructuralSelectionIndex(symbols)
  if (!index || symbols.classes.length !== 1) return null
  const boundaries = index.commands.filter((token) => {
    if (token.value !== 'begin') return false
    let start = token.end
    while (/\s/.test(index.masked[start] ?? '') && start < text.length) start++
    const end = index.groups.get(start)
    return (
      index.masked[start] === '{' &&
      end !== undefined &&
      index.masked.slice(start + 1, end).trim() === 'document'
    )
  })
  if (boundaries.length !== 1) return null
  const boundary = boundaries[0]!
  if (!topLevel(index, boundary.start)) return null
  const classEnd = classInsertion(text, index, boundary.start)
  if (classEnd === null) return null
  const insertion = afterPackageOptions(
    text,
    index,
    classEnd,
    Math.min(boundary.start, beforeOffset ?? Infinity),
  )
  if (insertion === null) return null
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const prefix = insertion === 0 || text[insertion - 1] === '\n' ? '' : newline
  return {
    file: root,
    range: { startOffset: insertion, endOffset: insertion },
    expectedText: '',
    newText: `${prefix}\\usepackage{${packageName}}${newline}`,
  }
}

function afterPackageOptions(
  text: string,
  index: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
  classEnd: number,
  before: number,
): number | null {
  let insertion = classEnd
  const commands = new Map(index.commands.map((token) => [token.start, token]))
  for (const token of index.commands) {
    if (['input', 'include', 'subfile'].includes(token.value))
      before = Math.min(before, token.start)
    if (token.value !== 'PassOptionsToPackage') continue
    const args = consumeRepairArguments(text, index, commands, token.end, [
      { kind: 'required' },
      { kind: 'required' },
    ])
    if (!args || args.missing.length) return null
    if (!topLevel(index, token.start)) return null
    insertion = Math.max(insertion, args.insertOffset)
  }
  if (text.slice(insertion, insertion + 2) === '\r\n') insertion += 2
  else if (text[insertion] === '\n') insertion++
  return insertion <= before ? insertion : null
}

function classInsertion(
  text: string,
  index: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
  documentStart: number,
): number | null {
  const declarations = index.commands.filter((token) => token.value === 'documentclass')
  if (declarations.length !== 1) return null
  const declaration = declarations[0]!
  if (declaration.start >= documentStart) return null
  if (!topLevel(index, declaration.start)) return null
  const argumentsRead = consumeRepairArguments(
    text,
    index,
    new Map(index.commands.map((token) => [token.start, token])),
    declaration.end,
    [{ kind: 'optional' }, { kind: 'required' }, { kind: 'optional' }],
  )
  if (!argumentsRead || argumentsRead.missing.length || argumentsRead.insertOffset > documentStart)
    return null
  let offset = argumentsRead.insertOffset
  if (text.slice(offset, offset + 2) === '\r\n') offset += 2
  else if (text[offset] === '\n') offset++
  return offset
}

function topLevel(
  index: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
  offset: number,
): boolean {
  for (const [start, end] of index.groups) {
    if (start < offset && end > offset) return false
  }
  return outsideControlScopes(index, offset)
}

function outsideControlScopes(
  index: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
  offset: number,
): boolean {
  let conditionals = 0
  let groups = 0
  const consumed = consumedControlOperands(index)
  if (!consumed) return false
  for (const token of index.commands) {
    if (token.start >= offset) break
    if (consumed.has(token.start)) continue
    if (isConditionalOpener(token.value)) conditionals++
    if (token.value === 'fi') conditionals--
    groups += CONTROL_GROUP_DELTA.get(token.value) ?? 0
  }
  return conditionals === 0 && groups === 0
}

function consumedControlOperands(
  index: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
): Set<number> | null {
  const consumed = new Set<number>()
  const commands = new Map(index.commands.map((token) => [token.start, token]))
  for (const token of index.commands) {
    if (consumed.has(token.start)) continue
    const count = CONTROL_OPERAND_COUNTS.get(token.value) ?? 0
    if (!count) continue
    const args = consumeRepairArguments(
      index.masked,
      index,
      commands,
      token.end,
      Array.from({ length: count }, () => ({ kind: 'required' as const })),
    )
    if (!args || args.missing.length) return null
    for (const argument of args.arguments) {
      if (argument.commandOffset !== undefined) consumed.add(argument.commandOffset)
    }
  }
  return consumed
}
