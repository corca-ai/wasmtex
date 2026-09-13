import type { CompletionCommandMetadataProvider } from './completion-context'
import type { CompletionCancellationToken } from './completion-registry'
import {
  consumeRepairArguments,
  type RepairArgumentConsumption,
} from './diagnostic-repair-arguments'
import { INLINE_VERB_COMMANDS, type Token } from './latex-tokenizer'
import type { CommandArg } from './package-db'
import { getStructuralSelectionIndex } from './structural-selection'
import type { FileSymbols } from './types'

export interface RepairInvocation {
  token: Token
  name: string
  signature: readonly CommandArg[]
  consumption: RepairArgumentConsumption
}

/** Source commands only; template, verbatim and inactive spans belong to the parser. */
export function repairInvocations(
  source: string,
  symbols: FileSymbols,
  metadata: CompletionCommandMetadataProvider,
  cancellation?: CompletionCancellationToken,
): RepairInvocation[] {
  const index = getStructuralSelectionIndex(symbols)
  if (!index || source.length > 1_000_000 || index.commands.length > 10_000) return []
  const scanner = new RepairInvocationScanner(source, index, metadata)
  for (const token of index.commands) {
    if (cancellation?.isCancellationRequested) return []
    scanner.visit(token)
  }
  return scanner.invocations
}

class RepairInvocationScanner {
  readonly invocations: RepairInvocation[] = []
  private commands: ReadonlyMap<number, Token>
  private consumedCommands = new Set<number>()
  private groupStarts: number[]
  private nextGroup = 0
  private enclosing: number[] = []
  private opaque: Array<{ start: number; end: number }> = []

  constructor(
    private source: string,
    private index: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
    private metadata: CompletionCommandMetadataProvider,
  ) {
    this.commands = new Map(index.commands.map((token) => [token.start, token]))
    this.groupStarts = [...index.groups.keys()]
      .filter((start) => index.masked[start] === '{')
      .sort((a, b) => a - b)
  }

  visit(token: Token): void {
    this.advanceGroups(token.start)
    if (INLINE_VERB_COMMANDS.has(token.value)) return
    this.opaque = this.opaque.filter((span) => span.end > token.start)
    if (
      this.consumedCommands.has(token.start) ||
      this.opaque.some((span) => token.start > span.start)
    )
      return
    const starred =
      this.source[token.end] === '*' &&
      this.metadata.getCommandArguments(`${token.value}*`) !== undefined
    const name = `${token.value}${starred ? '*' : ''}`
    const signature = this.metadata.getCommandArguments(name)
    if (!signature) {
      this.excludeUnknownGroups(token)
      return
    }
    const consumption = consumeRepairArguments(
      this.source,
      this.index,
      this.commands,
      token.end + Number(starred),
      signature,
    )
    if (!consumption) {
      this.excludeUnknownGroups(token)
      return
    }
    this.recordOwnership(consumption)
    this.invocations.push({ token, name, signature, consumption })
  }

  private excludeUnknownGroups(token: Token): void {
    // An unknown grammar may consume more than the adjacent brace groups.
    // Keep the remainder of its enclosing source group opaque.
    this.opaque.push({ start: token.start, end: this.enclosing.at(-1) ?? this.source.length })
  }

  private advanceGroups(offset: number): void {
    while ((this.groupStarts[this.nextGroup] ?? Infinity) < offset) {
      const start = this.groupStarts[this.nextGroup++]!
      while ((this.enclosing.at(-1) ?? Infinity) < start) this.enclosing.pop()
      this.enclosing.push(this.index.groups.get(start)!)
    }
    while ((this.enclosing.at(-1) ?? Infinity) < offset) this.enclosing.pop()
  }

  private recordOwnership(consumption: RepairArgumentConsumption): void {
    for (const argument of consumption.arguments) {
      if (argument.commandOffset !== undefined) this.consumedCommands.add(argument.commandOffset)
      if (argument.grouped && argument.spec.valueKind !== 'free-text') this.opaque.push(argument)
    }
  }
}
