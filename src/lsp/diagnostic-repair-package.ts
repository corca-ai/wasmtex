import type { CompletionCancellationToken } from './completion-registry'
import type { DiagnosticRepairSource } from './diagnostic-repair'
import { packagePreambleEdit } from './diagnostic-repair-preamble'
import type {
  LatexDiagnosticRepairsResult,
  LatexPackageRepairProposal,
} from './diagnostic-repair-types'
import { getCommandPackage } from './package-db'
import type { TexResourceRecord } from './resource-catalog'
import { getStructuralSelectionIndex } from './structural-selection'

export async function getPackageRepairs(
  source: DiagnosticRepairSource,
  path: string,
  offset: number,
  cancellation?: CompletionCancellationToken,
): Promise<LatexDiagnosticRepairsResult> {
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  const compiled = source.compileEvidence
  const site = compiled?.undefinedCommands.find(
    (value) =>
      value.file === path && value.range.startOffset <= offset && offset < value.range.endOffset,
  )
  if (!compiled || !site) return { ok: true, proposals: [] }
  const pkg = getCommandPackage(site.command)
  if (!pkg || !packageAbsent(source, pkg, site.command)) return { ok: true, proposals: [] }
  const resource = await availablePackage(source, pkg, cancellation)
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  if (!resource) return { ok: true, proposals: [] }
  const text = source.fs.readFile(source.root)
  const symbols = source.index.getFileSymbols(source.root)
  if (typeof text !== 'string' || !symbols) return { ok: true, proposals: [] }
  const edit = packagePreambleEdit(
    text,
    symbols,
    source.root,
    pkg,
    path === source.root ? site.range.startOffset : undefined,
  )
  if (!edit) return { ok: true, proposals: [] }
  // Diagnostic positions come from the exact source prefix, not a name-only lookup.
  const target = source.fs.readFile(path)
  if (
    typeof target !== 'string' ||
    target.slice(site.range.startOffset, site.range.endOffset) !== site.expectedText
  )
    return { ok: false, reason: 'stale' }
  const before = target.slice(0, site.range.startOffset)
  const line = before.split('\n').length
  const column = before.length - before.lastIndexOf('\n')
  const proposal: LatexPackageRepairProposal = {
    kind: 'missing-package',
    root: source.root,
    revision: source.revision,
    contextRevision: source.contextRevision,
    anchor: { file: path, range: site.range, expectedText: site.expectedText },
    command: site.command,
    package: pkg,
    diagnostic: {
      code: 'missing-package-dependency',
      file: path,
      line,
      column,
      endColumn: column + site.expectedText.length,
      severity: 'warning',
      message: `Command '\\${site.command}' requires package '${pkg}'`,
    },
    evidence: { kind: site.evidence, loadedResources: 'complete-recorder', resource },
    edits: [edit],
  }
  return { ok: true, proposals: [proposal] }
}

function packageAbsent(source: DiagnosticRepairSource, pkg: string, command: string): boolean {
  const loaded = source.compileEvidence?.snapshot.fields.loadedResources
  if (!loaded || loaded.status !== 'observed' || !loaded.complete || loaded.truncated) return false
  if (loaded.values.some(({ path }) => path.split('/').at(-1) === `${pkg}.sty`)) return false
  for (const file of source.index.getRootFiles(source.root)) {
    const symbols = source.index.getFileSymbols(file)
    if (symbols?.packages.some((value) => value.name === pkg)) return false
    if (
      symbols?.commands.some(
        (value) =>
          value.name === command || value.name === 'usepackage' || value.name === 'RequirePackage',
      )
    )
      return false
    if (
      symbols?.environmentDefs.some((value) =>
        [command, 'usepackage', 'RequirePackage'].includes(value.name),
      )
    )
      return false
    // An option directive in an included file has no literal root insertion boundary.
    if (
      file !== source.root &&
      getStructuralSelectionIndex(symbols)?.commands.some(
        (value) => value.value === 'PassOptionsToPackage',
      )
    )
      return false
  }
  // A local package shadows the mirror record even if this run never loaded it.
  return !source.fs.listFiles().some((file) => file.split('/').at(-1) === `${pkg}.sty`)
}

async function availablePackage(
  source: DiagnosticRepairSource,
  pkg: string,
  cancellation?: CompletionCancellationToken,
): Promise<TexResourceRecord | null> {
  const provider = source.resourceCatalog
  const identity = source.compileEvidence?.snapshot.identity
  if (
    !provider ||
    !identity ||
    provider.identity.texliveYear !== identity.profile.texliveYear ||
    provider.identity.mirrorRevision !== identity.profile.mirrorRevision
  )
    return null
  const state = await provider.load('tex-package', cancellation)
  if (
    state.status !== 'ready' ||
    state.shard.texliveYear !== identity.profile.texliveYear ||
    state.shard.mirrorRevision !== identity.profile.mirrorRevision
  )
    return null
  const resource = state.shard.resources.find(
    (value) => value.name === pkg && value.fileName === `${pkg}.sty`,
  )
  const engine = { pdflatex: 'pdftex', xelatex: 'xetex', lualatex: 'luatex' } as const
  if (!resource || (resource.engines && !resource.engines.includes(engine[identity.engine])))
    return null
  return structuredClone(resource)
}
