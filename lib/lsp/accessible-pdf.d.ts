import { CompletionSnapshotEngine } from '../types.js';
import { Diagnostic } from './diagnostic-provider.js';
export type AccessiblePdfEngine = CompletionSnapshotEngine | 'auto';
export interface AccessiblePdfProject {
    readonly files: Readonly<Record<string, string | Uint8Array>>;
    readonly mainFile: string;
}
export interface AccessiblePdfSourceOptions {
    engine?: AccessiblePdfEngine;
    mainFile?: string;
    /** Host-owned ignore directive name; defaults to wasmtex-ignore. */
    ignoreDirective?: string;
}
export type AccessiblePdfPreflightIssueCode = 'document-class-compatibility' | 'figure-alt-review' | 'heading-order-review' | 'incomplete-metadata' | 'link-purpose-review' | 'math-structure-review' | 'table-headers-review' | 'xelatex-compatibility';
export type AccessiblePdfRuleId = `a11y-${AccessiblePdfPreflightIssueCode}`;
export type AccessiblePdfPreflightIssueKind = 'fix' | 'review' | 'compatibility';
export type AccessiblePdfMetadataRequirement = 'language' | 'PDF 2.0' | 'PDF/UA-2' | 'tagging';
export interface AccessiblePdfPreflightIssue {
    readonly code: AccessiblePdfPreflightIssueCode;
    readonly file: string;
    readonly kind: AccessiblePdfPreflightIssueKind;
    readonly line: number;
    readonly ruleId: AccessiblePdfRuleId;
    readonly missing?: readonly AccessiblePdfMetadataRequirement[];
    readonly documentClass?: string;
    readonly support?: 'partial' | 'unsupported';
}
export interface AccessiblePdfPreflight {
    readonly issues: readonly AccessiblePdfPreflightIssue[];
    readonly summary: Readonly<Record<AccessiblePdfPreflightIssueKind, number>>;
}
export declare function accessibilityReviewIssues(path: string, source: string, masked: string): (AccessiblePdfPreflightIssue & {
    offset: number;
    length: number;
})[];
export declare function accessiblePdfSourceDiagnostics(files: Readonly<Record<string, string | Uint8Array>>, options?: AccessiblePdfSourceOptions): Diagnostic[];
export declare function buildAccessiblePdfPreflight(input: {
    readonly engine: AccessiblePdfEngine;
    readonly snapshot: AccessiblePdfProject;
    readonly ignoreDirective?: string;
}): AccessiblePdfPreflight;
