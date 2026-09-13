import { VirtualFS } from '../fs/virtual-fs.js';
import { CompletionCancellationToken } from './completion-registry.js';
import { ProjectIndex } from './project-index.js';
export interface UndefinedCommandEvidence {
    code: 'undefined-control-sequence';
    file: string;
    command: string;
    range: {
        startOffset: number;
        endOffset: number;
    };
    expectedText: string;
    evidence: 'direct-engine-error-context';
}
/**
 * Match a direct engine error to a real source token. The caller must first bind
 * this log to the current project revision, root, engine and compile profile.
 * Expansion stacks, truncated prefixes and missing file context are not proof
 * that the source command itself was undefined.
 */
export declare function undefinedCommandEvidence(log: string, fs: VirtualFS, index: ProjectIndex, root: string, cancellation?: CompletionCancellationToken): UndefinedCommandEvidence[];
