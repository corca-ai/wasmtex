import { LatexSyntaxRange } from '../syntax.js';
import { LabelDef } from './types.js';
/** A literal, editable key in current source; never an expanded macro location. */
export interface LatexReferenceOccurrence {
    file: string;
    range: LatexSyntaxRange;
    key: string;
    command: string;
    line: number;
    column: number;
}
export interface LatexReferenceCandidate {
    definition: LatexReferenceOccurrence;
    context?: NonNullable<LabelDef['context']>;
}
export type LatexReferenceProblem = {
    kind: 'undefined-reference';
    anchor: LatexReferenceOccurrence;
    candidates: LatexReferenceCandidate[];
} | {
    kind: 'duplicate-label';
    anchor: LatexReferenceOccurrence;
    definitions: LatexReferenceCandidate[];
    references: LatexReferenceOccurrence[];
};
export type LatexReferenceRepairRequest = {
    kind: 'undefined-reference';
    anchor: LatexReferenceOccurrence;
    target: LatexReferenceOccurrence;
} | {
    kind: 'duplicate-label';
    anchor: LatexReferenceOccurrence;
    newKey: string;
    /** Only these explicitly chosen references follow the renamed declaration. */
    references: LatexReferenceOccurrence[];
};
export interface LatexReferenceRepairEdit {
    file: string;
    range: LatexSyntaxRange;
    expectedText: string;
    newText: string;
}
export type ReferenceRepairRefusal = 'stale' | 'invalid-key' | 'cancelled' | 'limit';
export type LatexReferenceProblemResult = {
    ok: true;
    problem: LatexReferenceProblem | null;
} | {
    ok: false;
    reason: ReferenceRepairRefusal;
};
export type LatexReferenceRepairResult = {
    ok: true;
    edits: LatexReferenceRepairEdit[];
} | {
    ok: false;
    reason: ReferenceRepairRefusal;
};
