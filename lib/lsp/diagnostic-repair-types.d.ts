import { LatexSyntaxRange } from '../syntax.js';
import { CompletionSnapshot } from '../types.js';
import { Diagnostic } from './diagnostic-provider.js';
import { CommandArg } from './package-db.js';
import { TexResourceRecord } from './resource-catalog.js';
export interface LatexDiagnosticRepairEdit {
    file: string;
    range: LatexSyntaxRange;
    expectedText: string;
    newText: string;
}
interface LatexDiagnosticRepairBase {
    root: string;
    revision: number;
    contextRevision: string;
    anchor: {
        file: string;
        range: LatexSyntaxRange;
        expectedText: string;
    };
    diagnostic: Diagnostic;
    command: string;
    edits: LatexDiagnosticRepairEdit[];
}
export interface LatexArgumentRepairProposal extends LatexDiagnosticRepairBase {
    kind: 'missing-required-argument';
    missingArguments: readonly CommandArg[];
}
export interface LatexPackageRepairProposal extends LatexDiagnosticRepairBase {
    kind: 'missing-package';
    package: string;
    evidence: {
        kind: 'direct-engine-error-context';
        loadedResources: 'complete-recorder';
        resource: TexResourceRecord;
    };
}
export type LatexDiagnosticRepairProposal = LatexArgumentRepairProposal | LatexPackageRepairProposal;
export type LatexDiagnosticRepairRefusal = 'stale' | 'cancelled' | 'limit' | 'unsupported';
export type LatexDiagnosticRepairsResult = {
    ok: true;
    proposals: LatexDiagnosticRepairProposal[];
} | {
    ok: false;
    reason: LatexDiagnosticRepairRefusal;
};
export type LatexDiagnosticRepairPlanResult = {
    ok: true;
    edits: LatexDiagnosticRepairEdit[];
} | {
    ok: false;
    reason: LatexDiagnosticRepairRefusal;
};
export interface LatexDiagnosticCompileContext {
    snapshot: CompletionSnapshot;
    log: string;
    /** Binary inputs retained by the compiler host, not copied into a text-only service.
     * The host must invalidate this context whenever any such input changes. */
    binaryInputs?: readonly LatexDiagnosticBinaryInput[];
}
export interface LatexDiagnosticBinaryInput {
    path: string;
    digest: string;
}
export type LatexDiagnosticCompileContextResult = {
    ok: true;
    undefinedCommands: number;
} | {
    ok: false;
    reason: LatexDiagnosticRepairRefusal;
};
export {};
