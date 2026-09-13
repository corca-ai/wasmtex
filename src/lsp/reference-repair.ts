import type { CompletionCancellationToken } from './completion-registry'
import {
  type ReferenceRepairSource,
  referenceInventory,
  validReferenceKey,
} from './reference-repair-source'
import type {
  LatexReferenceOccurrence,
  LatexReferenceProblem,
  LatexReferenceProblemResult,
  LatexReferenceRepairRequest,
  LatexReferenceRepairResult,
} from './reference-repair-types'

export function getReferenceProblem(
  source: ReferenceRepairSource,
  path: string,
  offset: number,
  cancellation?: CompletionCancellationToken,
): LatexReferenceProblemResult {
  if (!Number.isSafeInteger(offset) || offset < 0) return { ok: true, problem: null }
  const inventory = referenceInventory(source, cancellation)
  if (typeof inventory === 'string') return { ok: false, reason: inventory }
  const contains = (value: LatexReferenceOccurrence) =>
    value.file === path && value.range.startOffset <= offset && offset < value.range.endOffset
  const definition = inventory.definitions.find((value) => contains(value.definition))
  const conflicts = definition
    ? inventory.definitions.filter((value) => value.definition.key === definition.definition.key)
    : []
  if (
    definition &&
    conflicts.length > 1 &&
    conflicts.length === inventory.names.get(definition.definition.key)
  ) {
    return {
      ok: true,
      problem: {
        kind: 'duplicate-label',
        anchor: definition.definition,
        definitions: conflicts,
        references: inventory.references.filter((value) => value.key === definition.definition.key),
      },
    }
  }
  const anchor = inventory.references.find(contains)
  if (
    !anchor ||
    inventory.names.has(anchor.key) ||
    source.index.getAuxLabels().has(anchor.key) ||
    source.index.getSemanticTrace()?.labels.has(anchor.key)
  )
    return { ok: true, problem: null }
  return {
    ok: true,
    problem: {
      kind: 'undefined-reference',
      anchor,
      candidates: inventory.definitions.filter(
        (value) => inventory.names.get(value.definition.key) === 1,
      ),
    },
  }
}

export function planReferenceRepair(
  source: ReferenceRepairSource,
  request: LatexReferenceRepairRequest,
  cancellation?: CompletionCancellationToken,
): LatexReferenceRepairResult {
  const result = getReferenceProblem(
    source,
    request.anchor.file,
    request.anchor.range.startOffset,
    cancellation,
  )
  if (!result.ok) return result
  const problem = result.problem
  if (
    !problem ||
    problem.kind !== request.kind ||
    !sameOccurrence(problem.anchor, request.anchor)
  ) {
    return { ok: false, reason: 'stale' }
  }
  if (problem.kind === 'undefined-reference' && request.kind === 'undefined-reference') {
    const target = problem.candidates.find((value) =>
      sameOccurrence(value.definition, request.target),
    )
    return target
      ? { ok: true, edits: [edit(problem.anchor, target.definition.key)] }
      : { ok: false, reason: 'stale' }
  }
  if (problem.kind !== 'duplicate-label' || request.kind !== 'duplicate-label')
    return { ok: false, reason: 'stale' }
  return planDuplicate(source, request, problem, cancellation)
}

function planDuplicate(
  source: ReferenceRepairSource,
  request: Extract<LatexReferenceRepairRequest, { kind: 'duplicate-label' }>,
  problem: Extract<LatexReferenceProblem, { kind: 'duplicate-label' }>,
  cancellation?: CompletionCancellationToken,
): LatexReferenceRepairResult {
  if (!validReferenceKey(request.newKey)) return { ok: false, reason: 'invalid-key' }
  const inventory = referenceInventory(source, cancellation)
  if (typeof inventory === 'string') return { ok: false, reason: inventory }
  if (
    inventory.names.has(request.newKey) ||
    source.index.getAuxLabels().has(request.newKey) ||
    source.index.getSemanticTrace()?.labels.has(request.newKey)
  )
    return { ok: false, reason: 'invalid-key' }
  if (request.references.length > problem.references.length) return { ok: false, reason: 'stale' }
  const chosen = new Set(request.references.map(occurrenceId))
  const selected = problem.references.filter((value) => chosen.has(occurrenceId(value)))
  if (selected.length !== request.references.length) return { ok: false, reason: 'stale' }
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  return {
    ok: true,
    edits: [problem.anchor, ...selected].map((value) => edit(value, request.newKey)),
  }
}

function edit(value: LatexReferenceOccurrence, newText: string) {
  return { file: value.file, range: { ...value.range }, expectedText: value.key, newText }
}

function sameOccurrence(left: LatexReferenceOccurrence, right: LatexReferenceOccurrence): boolean {
  return (
    left.file === right.file &&
    left.key === right.key &&
    left.command === right.command &&
    left.range.startOffset === right.range.startOffset &&
    left.range.endOffset === right.range.endOffset &&
    left.line === right.line &&
    left.column === right.column
  )
}

function occurrenceId(value: LatexReferenceOccurrence): string {
  return JSON.stringify([
    value.file,
    value.key,
    value.command,
    value.range.startOffset,
    value.range.endOffset,
    value.line,
    value.column,
  ])
}
