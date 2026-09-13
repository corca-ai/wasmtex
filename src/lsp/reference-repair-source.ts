import type { VirtualFS } from '../fs/virtual-fs'
import type { CompletionCancellationToken } from './completion-registry'
import { REF_CMDS } from './latex-patterns'
import type { Token } from './latex-tokenizer'
import type { ProjectIndex } from './project-index'
import type { LatexReferenceCandidate, LatexReferenceOccurrence } from './reference-repair-types'
import { offsetToLineCol } from './source-position'
import { getStructuralSelectionIndex } from './structural-selection'
import type { FileSymbols, LabelDef } from './types'

const references = new Set(REF_CMDS.split('|'))
const MAX_FILES = 1024
const MAX_SOURCE_UNITS = 4_000_000
const MAX_OCCURRENCES = 10_000

export interface ReferenceRepairSource {
  index: ProjectIndex
  fs: VirtualFS
  root: string
}

export interface ReferenceInventory {
  definitions: LatexReferenceCandidate[]
  references: LatexReferenceOccurrence[]
  names: Map<string, number>
}

export function validReferenceKey(key: string): boolean {
  return key.length > 0 && key.length <= 256 && /^[\p{L}\p{M}\p{N}:._/-]+$/u.test(key)
}

export function referenceInventory(
  source: ReferenceRepairSource,
  cancellation?: CompletionCancellationToken,
): ReferenceInventory | 'cancelled' | 'limit' {
  const files = source.index.getRootFiles(source.root)
  if (files.length > MAX_FILES) return 'limit'
  const inventory: ReferenceInventory = { definitions: [], references: [], names: new Map() }
  const blocked = blockedCommands(source.index, files)
  let units = 0
  for (const file of files) {
    if (cancellation?.isCancellationRequested) return 'cancelled'
    const text = source.fs.readFile(file)
    const symbols = source.index.getFileSymbols(file)
    if (typeof text !== 'string' || !symbols) continue
    units += text.length
    if (units > MAX_SOURCE_UNITS) return 'limit'
    collectFile(inventory, file, text, symbols, blocked)
    if (inventory.definitions.length + inventory.references.length > MAX_OCCURRENCES) return 'limit'
  }
  return cancellation?.isCancellationRequested ? 'cancelled' : inventory
}

function collectFile(
  inventory: ReferenceInventory,
  file: string,
  text: string,
  symbols: FileSymbols,
  blocked: Set<string>,
): void {
  const structure = getStructuralSelectionIndex(symbols)
  if (!structure) return
  collectNames(inventory, text, symbols, structure)
  const labels = new Map(symbols.labels.map((label) => [locationKey(label), label]))
  const refs = new Set(symbols.labelRefs.map(locationKey))
  for (const token of structure.commands) {
    if (blocked.has(token.value)) continue
    if (token.value !== 'label' && !references.has(token.value)) continue
    const occurrence = literalOccurrence(file, text, structure, token)
    if (!occurrence) continue
    const { line, column, key } = occurrence
    const id = `${line}:${column}:${key}`
    if (token.value === 'label') addDefinition(inventory, occurrence, labels.get(id))
    else if (refs.has(id)) inventory.references.push(occurrence)
  }
}

function collectNames(
  inventory: ReferenceInventory,
  text: string,
  symbols: FileSymbols,
  structure: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
): void {
  for (const label of symbols.labels) {
    const offset = (structure.lineStarts[label.location.line - 1] ?? 0) + label.location.column - 1
    // Legacy symbols may include uncalled template bodies. Actual shallow
    // expansion locations point to an unmasked call site instead.
    if (structure.masked[offset] !== text[offset]) continue
    inventory.names.set(label.name, (inventory.names.get(label.name) ?? 0) + 1)
  }
}

function literalOccurrence(
  file: string,
  text: string,
  structure: NonNullable<ReturnType<typeof getStructuralSelectionIndex>>,
  token: Token,
): LatexReferenceOccurrence | null {
  const close = structure.groups.get(token.end)
  if (text[token.end] !== '{' || close === undefined) return null
  const raw = text.slice(token.end + 1, close)
  const key = raw.trim()
  if (!validReferenceKey(key) || structure.masked.slice(token.end + 1, close) !== raw) return null
  const startOffset = token.end + 1 + raw.length - raw.trimStart().length
  return {
    file,
    key,
    command: token.value,
    ...offsetToLineCol(structure.lineStarts, startOffset),
    range: { startOffset, endOffset: startOffset + key.length },
  }
}

function locationKey(value: { name: string; location: { line: number; column: number } }): string {
  return `${value.location.line}:${value.location.column}:${value.name}`
}

function addDefinition(
  inventory: ReferenceInventory,
  definition: LatexReferenceOccurrence,
  label: LabelDef | undefined,
): void {
  if (!label) return
  inventory.definitions.push({
    definition,
    ...(label.context ? { context: { ...label.context } } : {}),
  })
}

function blockedCommands(index: ProjectIndex, files: string[]): Set<string> {
  const blocked = new Set<string>()
  for (const file of files) {
    const symbols = index.getFileSymbols(file)
    for (const command of symbols?.commands ?? []) blocked.add(command.name)
    for (const environment of symbols?.environmentDefs ?? []) {
      blocked.add(environment.name)
      blocked.add(`end${environment.name}`)
    }
  }
  return blocked
}
