import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionSnapshot, CompletionSnapshotEngine, CompletionSnapshotProfile } from '../types.js';
import { CompletionCancellationToken } from './completion-registry.js';
import { UndefinedCommandEvidence } from './diagnostic-repair-compile.js';
import { LatexDiagnosticBinaryInput, LatexDiagnosticCompileContext, LatexDiagnosticRepairRefusal } from './diagnostic-repair-types.js';
import { ProjectIndex } from './project-index.js';
export interface DiagnosticCompileSource {
    fs: VirtualFS;
    index: ProjectIndex;
    root: string;
    profile: CompletionSnapshotProfile | undefined;
    engine: CompletionSnapshotEngine | undefined;
}
export interface DiagnosticCompileEvidence {
    snapshot: CompletionSnapshot;
    undefinedCommands: UndefinedCommandEvidence[];
}
export declare function bindDiagnosticCompileContext(source: DiagnosticCompileSource, context: LatexDiagnosticCompileContext, cancellation?: CompletionCancellationToken): Promise<{
    ok: true;
    evidence: DiagnosticCompileEvidence;
} | {
    ok: false;
    reason: LatexDiagnosticRepairRefusal;
}>;
/** Produce the binary part of a compile identity without transferring resource bytes. */
export declare function diagnosticCompileBinaryInputs(files: Readonly<Record<string, string | Uint8Array>>): Promise<LatexDiagnosticBinaryInput[]>;
