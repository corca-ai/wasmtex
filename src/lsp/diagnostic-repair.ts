import type { VirtualFS } from '../fs/virtual-fs'
import type { CompletionCommandMetadataProvider } from './completion-context'
import type { CompletionCancellationToken, CompletionResolverRegistry } from './completion-registry'
import type { DiagnosticCompileEvidence } from './diagnostic-repair-context'
import { repairInvocations } from './diagnostic-repair-invocations'
import { getPackageRepairs } from './diagnostic-repair-package'
import type {
  LatexArgumentRepairProposal,
  LatexDiagnosticRepairPlanResult,
  LatexDiagnosticRepairProposal,
  LatexDiagnosticRepairRefusal,
  LatexDiagnosticRepairsResult,
} from './diagnostic-repair-types'
import type { CommandArg } from './package-db'
import type { ProjectIndex } from './project-index'
import type { TexResourceCatalogProvider } from './resource-catalog'
import { getStructuralSelectionIndex } from './structural-selection'
import type { CommandDef } from './types'

export interface DiagnosticRepairSource {
  fs: VirtualFS
  index: ProjectIndex
  root: string
  revision: number
  contextRevision: string
  registry: CompletionResolverRegistry
  compileEvidence?: DiagnosticCompileEvidence
  resourceCatalog?: TexResourceCatalogProvider
}

export function getArgumentRepairs(
  source: DiagnosticRepairSource,
  path: string,
  offset: number,
  cancellation?: CompletionCancellationToken,
): LatexDiagnosticRepairsResult {
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  const files = source.index.getRootFiles(source.root)
  if (files.length > 1024) return { ok: false, reason: 'limit' }
  if (!files.includes(path) || !Number.isSafeInteger(offset) || offset < 0)
    return { ok: true, proposals: [] }
  const text = source.fs.readFile(path)
  const symbols = source.index.getFileSymbols(path)
  if (typeof text !== 'string' || !symbols) return { ok: true, proposals: [] }
  if (text.length > 1_000_000) return { ok: false, reason: 'limit' }
  if ((getStructuralSelectionIndex(symbols)?.commands.length ?? 0) > 10_000)
    return { ok: false, reason: 'limit' }
  const refusal = rootScanRefusal(source.fs, files, cancellation)
  if (refusal) return { ok: false, reason: refusal }
  const metadata = diagnosticRepairMetadata(source, files)
  const invocation = repairInvocations(text, symbols, metadata, cancellation).find(
    ({ token }) => token.start <= offset && offset < token.end,
  )
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  if (!invocation?.consumption.missing.length) return { ok: true, proposals: [] }
  // TeX resumes the including file after EOF; its next token may supply the argument.
  if (path !== source.root && invocation.consumption.missingBoundary === 'eof')
    return { ok: true, proposals: [] }
  const { token, consumption, name } = invocation
  const proposal: LatexArgumentRepairProposal = {
    kind: 'missing-required-argument',
    root: source.root,
    revision: source.revision,
    contextRevision: source.contextRevision,
    anchor: {
      file: path,
      range: { startOffset: token.start, endOffset: token.end },
      expectedText: text.slice(token.start, token.end),
    },
    diagnostic: {
      code: 'missing-required-argument',
      file: path,
      line: token.line,
      column: token.column,
      endColumn: token.column + token.end - token.start,
      severity: 'warning',
      message: `Command '\\${name}' is missing ${consumption.missing.length} required argument(s)`,
    },
    command: name,
    missingArguments: consumption.missing.map((argument) => ({ ...argument })),
    edits: [
      {
        file: path,
        range: { startOffset: consumption.insertOffset, endOffset: consumption.insertOffset },
        expectedText: '',
        newText: '{}'.repeat(consumption.missing.length),
      },
    ],
  }
  return { ok: true, proposals: [proposal] }
}

function rootScanRefusal(
  fs: VirtualFS,
  files: readonly string[],
  cancellation?: CompletionCancellationToken,
): LatexDiagnosticRepairRefusal | null {
  let total = 0
  for (const file of files) {
    if (cancellation?.isCancellationRequested) return 'cancelled'
    const content = fs.readFile(file)
    total += typeof content === 'string' ? content.length : 0
    if (total > 4_000_000) return 'limit'
  }
  return null
}

/** Recompute the proposal; caller-provided edits never become authority. */
export async function planDiagnosticRepair(
  source: DiagnosticRepairSource,
  request: LatexDiagnosticRepairProposal,
  cancellation?: CompletionCancellationToken,
): Promise<LatexDiagnosticRepairPlanResult> {
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  if (
    request.root !== source.root ||
    request.revision !== source.revision ||
    request.contextRevision !== source.contextRevision
  )
    return { ok: false, reason: 'stale' }
  const current = await getDiagnosticRepairs(
    source,
    request.anchor.file,
    request.anchor.range.startOffset,
    cancellation,
  )
  if (!current.ok) return current
  const proposal = current.proposals.find((candidate) => sameRepair(candidate, request))
  return proposal ? { ok: true, edits: proposal.edits } : { ok: false, reason: 'stale' }
}

export async function getDiagnosticRepairs(
  source: DiagnosticRepairSource,
  path: string,
  offset: number,
  cancellation?: CompletionCancellationToken,
): Promise<LatexDiagnosticRepairsResult> {
  const argumentsResult = getArgumentRepairs(source, path, offset, cancellation)
  if (!argumentsResult.ok) return argumentsResult
  const packages = await getPackageRepairs(source, path, offset, cancellation)
  if (!packages.ok) return packages
  return { ok: true, proposals: [...argumentsResult.proposals, ...packages.proposals] }
}

export function revalidateArgumentRepairs(
  source: DiagnosticRepairSource,
  path: string,
  offset: number,
  previous: LatexDiagnosticRepairsResult,
  cancellation?: CompletionCancellationToken,
): LatexDiagnosticRepairsResult {
  if (!previous.ok) return previous
  const current = getArgumentRepairs(source, path, offset, cancellation)
  return current.ok
    ? {
        ok: true,
        proposals: [
          ...current.proposals,
          ...previous.proposals.filter((value) => value.kind === 'missing-package'),
        ],
      }
    : current
}

export function planArgumentRepair(
  source: DiagnosticRepairSource,
  request: LatexArgumentRepairProposal,
  cancellation?: CompletionCancellationToken,
): LatexDiagnosticRepairPlanResult {
  const current = getArgumentRepairs(
    source,
    request.anchor.file,
    request.anchor.range.startOffset,
    cancellation,
  )
  if (!current.ok) return current
  const proposal = current.proposals.find((candidate) => sameRepair(candidate, request))
  return proposal ? { ok: true, edits: proposal.edits } : { ok: false, reason: 'stale' }
}

function sameRepair(
  actual: LatexDiagnosticRepairProposal,
  expected: LatexDiagnosticRepairProposal,
): boolean {
  return (
    actual.kind === expected.kind &&
    actual.command === expected.command &&
    actual.anchor.expectedText === expected.anchor.expectedText &&
    actual.anchor.range.endOffset === expected.anchor.range.endOffset &&
    sameRepairEvidence(actual, expected) &&
    JSON.stringify(actual.edits) === JSON.stringify(expected.edits)
  )
}

function sameRepairEvidence(
  actual: LatexDiagnosticRepairProposal,
  expected: LatexDiagnosticRepairProposal,
): boolean {
  if (actual.kind === 'missing-required-argument' && expected.kind === actual.kind)
    return JSON.stringify(actual.missingArguments) === JSON.stringify(expected.missingArguments)
  if (actual.kind === 'missing-package' && expected.kind === actual.kind)
    return (
      actual.package === expected.package &&
      JSON.stringify(actual.evidence) === JSON.stringify(expected.evidence)
    )
  return false
}

function declaredArguments(
  definition: CommandDef,
  duplicate: boolean,
): readonly CommandArg[] | null {
  if (duplicate || definition.mayRedefine) return null
  return (
    definition.arguments?.map(({ kind, balancedOptional }) => ({
      kind,
      ...(balancedOptional === undefined ? {} : { balancedOptional }),
    })) ?? null
  )
}

function diagnosticRepairMetadata(
  source: DiagnosticRepairSource,
  files: readonly string[],
): CompletionCommandMetadataProvider {
  const definitions = new Map<string, readonly CommandArg[] | null>()
  const scopes = new Set<string>()
  for (const file of files) {
    const symbols = source.index.getFileSymbols(file)
    if (!symbols) continue
    for (const definition of symbols.commands) {
      const args = declaredArguments(definition, definitions.has(definition.name))
      definitions.set(definition.name, args)
      definitions.set(`${definition.name}*`, definition.acceptsStar ? args : null)
    }
    for (const environment of symbols.environmentDefs) {
      definitions.set(environment.name, null)
      definitions.set(`end${environment.name}`, null)
    }
    for (const pkg of symbols.packages) scopes.add(`package/${pkg.name}`)
    for (const cls of symbols.classes) scopes.add(`class/${cls.name}`)
  }
  return {
    getCommandArguments(name) {
      return definitions.has(name)
        ? (definitions.get(name) ?? undefined)
        : source.registry.getScopedCommandArguments(name, scopes)
    },
  }
}
