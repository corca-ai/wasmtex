import { CompletionCancellationToken } from './completion-registry.js';
import { ReferenceRepairSource } from './reference-repair-source.js';
import { LatexReferenceProblemResult, LatexReferenceRepairRequest, LatexReferenceRepairResult } from './reference-repair-types.js';
export declare function getReferenceProblem(source: ReferenceRepairSource, path: string, offset: number, cancellation?: CompletionCancellationToken): LatexReferenceProblemResult;
export declare function planReferenceRepair(source: ReferenceRepairSource, request: LatexReferenceRepairRequest, cancellation?: CompletionCancellationToken): LatexReferenceRepairResult;
