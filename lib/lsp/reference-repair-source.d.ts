import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionCancellationToken } from './completion-registry.js';
import { ProjectIndex } from './project-index.js';
import { LatexReferenceCandidate, LatexReferenceOccurrence } from './reference-repair-types.js';
export interface ReferenceRepairSource {
    index: ProjectIndex;
    fs: VirtualFS;
    root: string;
}
export interface ReferenceInventory {
    definitions: LatexReferenceCandidate[];
    references: LatexReferenceOccurrence[];
    names: Map<string, number>;
}
export declare function validReferenceKey(key: string): boolean;
export declare function referenceInventory(source: ReferenceRepairSource, cancellation?: CompletionCancellationToken): ReferenceInventory | 'cancelled' | 'limit';
