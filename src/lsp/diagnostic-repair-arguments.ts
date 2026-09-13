import type { Token } from './latex-tokenizer'
import type { CommandArg } from './package-db'
import type { getStructuralSelectionIndex } from './structural-selection'

type SourceIndex = NonNullable<ReturnType<typeof getStructuralSelectionIndex>>

export interface ConsumedRepairArgument {
  spec: CommandArg
  start: number
  end: number
  /** A control sequence used as one argument is not a separate source invocation. */
  commandOffset?: number
  grouped: boolean
}

export interface RepairArgumentConsumption {
  arguments: ConsumedRepairArgument[]
  missing: readonly CommandArg[]
  insertOffset: number
  missingBoundary?: 'eof' | 'group'
}

/**
 * Undelimited TeX argument consumption, not completion's tolerant group collection.
 * A command token consumes one argument without expanding its own arguments first.
 * null means that this source cannot prove which argument is missing.
 */
export function consumeRepairArguments(
  source: string,
  index: SourceIndex,
  commands: ReadonlyMap<number, Token>,
  start: number,
  signature: readonly CommandArg[],
): RepairArgumentConsumption | null {
  if (signature.length > 64) return null
  const consumed: ConsumedRepairArgument[] = []
  let end = start
  for (let i = 0; i < signature.length; i++) {
    const spec = signature[i]!
    const offset = skipRepairTrivia(source, index.masked, end)
    if (spec.kind === 'optional' && (offset === null || index.masked[offset] !== '[')) continue
    if (offset === null) return null
    const char = index.masked[offset]
    if (offset === source.length || char === '}') {
      return missingConsumption(consumed, signature.slice(i), end, offset === source.length)
    }
    const argument = consumeArgument(source, index, commands, offset, spec)
    if (!argument) return null
    consumed.push(argument)
    end = argument.end
  }
  return { arguments: consumed, missing: [], insertOffset: end }
}

function missingConsumption(
  argumentsRead: ConsumedRepairArgument[],
  remaining: readonly CommandArg[],
  insertOffset: number,
  atEof: boolean,
): RepairArgumentConsumption {
  return {
    arguments: argumentsRead,
    missing: remaining.filter((argument) => argument.kind === 'required'),
    insertOffset,
    missingBoundary: atEof ? 'eof' : 'group',
  }
}

function consumeArgument(
  source: string,
  index: SourceIndex,
  commands: ReadonlyMap<number, Token>,
  start: number,
  spec: CommandArg,
): ConsumedRepairArgument | null {
  const char = index.masked[start]!
  if (char === '{' || spec.kind === 'optional') {
    const close = (spec.balancedOptional ? index.balancedGroups : index.groups).get(start)
    return close === undefined ? null : { spec, start, end: close + 1, grouped: true }
  }
  const command = commands.get(start)
  if (command) {
    return { spec, start, end: command.end, grouped: false, commandOffset: start }
  }
  // Active characters, math shifts and engine-dependent Unicode tokenization
  // need evidence beyond the legacy required/optional signature contract.
  if (source[start] !== char || /[\\$&#_^~]/.test(char) || char.charCodeAt(0) > 127) return null
  return { spec, start, end: start + 1, grouped: false }
}

function skipRepairTrivia(source: string, masked: string, start: number): number | null {
  let offset = start
  let newlines = 0
  while (offset < source.length) {
    const char = source[offset]!
    if (char === '%' && masked[offset] === ' ') {
      const next = source.indexOf('\n', offset)
      if (next < 0) return source.length
      offset = next + 1
      continue
    }
    if (!/[ \t\r\n]/.test(char)) return source[offset] === masked[offset] ? offset : null
    if (char === '\n' && ++newlines > 1) return null // a paragraph token, not mere whitespace
    offset++
  }
  return offset
}
