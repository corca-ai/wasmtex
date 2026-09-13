import { LatexFileSyntax, LatexSyntaxRange } from '../syntax.js';
import { CompletionCommandMetadataProvider } from './completion-context.js';
import { CompletionCancellationToken } from './completion-registry.js';
import { ProjectIndex } from './project-index.js';
import { WrapRefusal } from './wrap-boundary.js';
import { LatexWrapOption } from './wrap-catalog.js';
export type { WrapRefusal } from './wrap-boundary.js';
export type { LatexWrapOption } from './wrap-catalog.js';
export interface LatexWrapRequest {
    range: LatexSyntaxRange;
    kind: 'command' | 'environment';
    name: string;
    /** Signature-indexed values. The selection slot must be null; omitted optional slots are null. */
    arguments: readonly (string | null)[];
}
export interface LatexWrapEdit {
    range: LatexSyntaxRange;
    expectedText: string;
    newText: string;
}
export type LatexWrapOptionsResult = {
    ok: true;
    options: LatexWrapOption[];
} | {
    ok: false;
    reason: WrapRefusal;
};
export type LatexWrapPlanResult = {
    ok: true;
    edit: LatexWrapEdit;
} | {
    ok: false;
    reason: WrapRefusal;
};
export interface WrapSource {
    source: string;
    syntax: LatexFileSyntax | null;
    index: ProjectIndex;
    path: string;
    metadata: CompletionCommandMetadataProvider;
}
export declare function getWrapOptions(input: WrapSource, range: LatexSyntaxRange, cancellation?: CompletionCancellationToken): LatexWrapOptionsResult;
export declare function planWrapSelection(input: WrapSource, request: LatexWrapRequest, cancellation?: CompletionCancellationToken): LatexWrapPlanResult;
