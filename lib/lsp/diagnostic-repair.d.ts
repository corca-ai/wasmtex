import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionCancellationToken, CompletionResolverRegistry } from './completion-registry.js';
import { DiagnosticCompileEvidence } from './diagnostic-repair-context.js';
import { LatexArgumentRepairProposal, LatexDiagnosticRepairPlanResult, LatexDiagnosticRepairProposal, LatexDiagnosticRepairsResult } from './diagnostic-repair-types.js';
import { ProjectIndex } from './project-index.js';
import { TexResourceCatalogProvider } from './resource-catalog.js';
export interface DiagnosticRepairSource {
    fs: VirtualFS;
    index: ProjectIndex;
    root: string;
    revision: number;
    contextRevision: string;
    registry: CompletionResolverRegistry;
    compileEvidence?: DiagnosticCompileEvidence;
    resourceCatalog?: TexResourceCatalogProvider;
}
export declare function getArgumentRepairs(source: DiagnosticRepairSource, path: string, offset: number, cancellation?: CompletionCancellationToken): LatexDiagnosticRepairsResult;
/** Recompute the proposal; caller-provided edits never become authority. */
export declare function planDiagnosticRepair(source: DiagnosticRepairSource, request: LatexDiagnosticRepairProposal, cancellation?: CompletionCancellationToken): Promise<LatexDiagnosticRepairPlanResult>;
export declare function getDiagnosticRepairs(source: DiagnosticRepairSource, path: string, offset: number, cancellation?: CompletionCancellationToken): Promise<LatexDiagnosticRepairsResult>;
export declare function revalidateArgumentRepairs(source: DiagnosticRepairSource, path: string, offset: number, previous: LatexDiagnosticRepairsResult, cancellation?: CompletionCancellationToken): LatexDiagnosticRepairsResult;
export declare function planArgumentRepair(source: DiagnosticRepairSource, request: LatexArgumentRepairProposal, cancellation?: CompletionCancellationToken): LatexDiagnosticRepairPlanResult;
