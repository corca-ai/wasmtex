import { LatexFileSyntax, LatexSyntaxRange } from '../syntax.js';
import { CompletionCommandMetadataProvider } from './completion-context.js';
import { CompletionCancellationToken } from './completion-registry.js';
import { getStructuralSelectionIndex } from './structural-selection.js';
import { WrapDefinition } from './wrap-catalog.js';
export type WrapRefusal = 'invalid-range' | 'unsafe-boundary' | 'unsupported-context' | 'unknown-wrapper' | 'missing-argument' | 'invalid-argument' | 'cancelled' | 'limit';
export type WrapBoundaryResult = {
    ok: true;
    context: 'text' | 'math';
} | {
    ok: false;
    reason: WrapRefusal;
};
type SelectionIndex = NonNullable<ReturnType<typeof getStructuralSelectionIndex>>;
export declare function wrapBoundary(source: string, range: LatexSyntaxRange, syntax: LatexFileSyntax | null, index: SelectionIndex | undefined, metadata: CompletionCommandMetadataProvider, wrappers: readonly WrapDefinition[], blockedCommands: ReadonlySet<string>, cancellation?: CompletionCancellationToken): WrapBoundaryResult;
export {};
