import type { Diagnostic } from './diagnostic-provider'
import { type ReferenceRepairSource, referenceInventory } from './reference-repair-source'
import type { LatexReferenceOccurrence } from './reference-repair-types'

/** Only exact literal source locations enter the repairable diagnostic surface. */
export function referenceRepairDiagnostics(source: ReferenceRepairSource): Diagnostic[] {
  const inventory = referenceInventory(source)
  if (typeof inventory === 'string') return []
  const diagnostics: Diagnostic[] = []
  for (const reference of inventory.references) {
    if (
      inventory.names.has(reference.key) ||
      source.index.getAuxLabels().has(reference.key) ||
      source.index.getSemanticTrace()?.labels.has(reference.key)
    )
      continue
    diagnostics.push({
      ...location(reference),
      code: 'undefined-ref',
      severity: 'warning',
      message: `Undefined reference '${reference.key}'`,
    })
  }
  const groups = new Map<string, LatexReferenceOccurrence[]>()
  for (const { definition } of inventory.definitions) {
    const group = groups.get(definition.key) ?? []
    group.push(definition)
    groups.set(definition.key, group)
  }
  for (const [key, definitions] of groups) {
    // Generated declarations do not acquire invented editable conflict locations.
    if (definitions.length < 2 || definitions.length !== inventory.names.get(key)) continue
    for (const definition of definitions) {
      diagnostics.push({
        ...location(definition),
        code: 'duplicate-label',
        severity: 'warning',
        message: `Duplicate label '${key}' (${definitions.length} declarations)`,
        relatedInformation: definitions
          .slice(0, 33)
          .filter((other) => other !== definition)
          .slice(0, 32)
          .map((other) => ({
            ...location(other),
            message: `Conflicting label '${key}'`,
          })),
      })
    }
  }
  return diagnostics
}

function location(value: LatexReferenceOccurrence) {
  return {
    file: value.file,
    line: value.line,
    column: value.column,
    endColumn: value.column + value.key.length,
  }
}
