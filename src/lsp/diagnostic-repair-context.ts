import {
  boundCompletionSnapshot,
  type CompletionSnapshotProjectFile,
  completionFileDigest,
  completionProjectRevision,
} from '../engine/completion-snapshot'
import type { VirtualFS } from '../fs/virtual-fs'
import type {
  CompletionSnapshot,
  CompletionSnapshotEngine,
  CompletionSnapshotProfile,
} from '../types'
import type { CompletionCancellationToken } from './completion-registry'
import {
  type UndefinedCommandEvidence,
  undefinedCommandEvidence,
} from './diagnostic-repair-compile'
import type {
  LatexDiagnosticBinaryInput,
  LatexDiagnosticCompileContext,
  LatexDiagnosticRepairRefusal,
} from './diagnostic-repair-types'
import type { ProjectIndex } from './project-index'

export interface DiagnosticCompileSource {
  fs: VirtualFS
  index: ProjectIndex
  root: string
  profile: CompletionSnapshotProfile | undefined
  engine: CompletionSnapshotEngine | undefined
}

export interface DiagnosticCompileEvidence {
  snapshot: CompletionSnapshot
  undefinedCommands: UndefinedCommandEvidence[]
}

export async function bindDiagnosticCompileContext(
  source: DiagnosticCompileSource,
  context: LatexDiagnosticCompileContext,
  cancellation?: CompletionCancellationToken,
): Promise<
  | { ok: true; evidence: DiagnosticCompileEvidence }
  | { ok: false; reason: LatexDiagnosticRepairRefusal }
> {
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  if (context.log.length > 4_000_000) return { ok: false, reason: 'limit' }
  const snapshot = boundCompletionSnapshot(context.snapshot)
  const identity = snapshot.identity
  const profile = source.profile
  if (!profile?.mirrorRevision || !source.engine) return { ok: false, reason: 'unsupported' }
  if (
    identity.root !== source.root ||
    identity.engine !== source.engine ||
    identity.profile.id !== profile.id ||
    identity.profile.texliveYear !== profile.texliveYear ||
    identity.profile.mirrorRevision !== profile.mirrorRevision
  )
    return { ok: false, reason: 'stale' }
  const files = compileInputs(source.fs, context.binaryInputs ?? [])
  if (!files) return { ok: false, reason: 'unsupported' }
  if (!files.some((file) => file.path === source.root)) return { ok: false, reason: 'stale' }
  const revision = await completionProjectRevision(files)
  if (cancellation?.isCancellationRequested) return { ok: false, reason: 'cancelled' }
  if (identity.projectRevision !== revision) return { ok: false, reason: 'stale' }
  return {
    ok: true,
    evidence: {
      snapshot,
      undefinedCommands: undefinedCommandEvidence(
        context.log,
        source.fs,
        source.index,
        source.root,
        cancellation,
      ),
    },
  }
}

/** Produce the binary part of a compile identity without transferring resource bytes. */
export async function diagnosticCompileBinaryInputs(
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<LatexDiagnosticBinaryInput[]> {
  const inputs: LatexDiagnosticBinaryInput[] = []
  for (const [path, content] of Object.entries(files)) {
    if (typeof content !== 'string')
      inputs.push({ path, digest: await completionFileDigest(content) })
  }
  return inputs
}

function compileInputs(
  fs: VirtualFS,
  binaryInputs: readonly LatexDiagnosticBinaryInput[],
): CompletionSnapshotProjectFile[] | null {
  if (binaryInputs.length > 8192) return null
  const files: CompletionSnapshotProjectFile[] = fs.listFiles().flatMap((path) => {
    const content = fs.readFile(path)
    return content === null
      ? []
      : [{ path, content: typeof content === 'string' ? content : Uint8Array.from(content) }]
  })
  const present = new Set(files.map((file) => file.path))
  for (const input of binaryInputs) {
    if (
      !input.path ||
      present.has(input.path) ||
      !/^[a-f0-9]{64}$/.test(input.digest) ||
      /\.(?:tex|sty|cls|ltx|def|cfg|clo|ldf)$/i.test(input.path)
    )
      return null
    present.add(input.path)
    files.push({ path: input.path, content: new Uint8Array(0), digest: input.digest })
  }
  return files
}
