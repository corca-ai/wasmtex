import { CompletionCancellationToken } from './completion-registry.js';
import { DiagnosticRepairSource } from './diagnostic-repair.js';
import { LatexDiagnosticRepairsResult } from './diagnostic-repair-types.js';
export declare function getPackageRepairs(source: DiagnosticRepairSource, path: string, offset: number, cancellation?: CompletionCancellationToken): Promise<LatexDiagnosticRepairsResult>;
