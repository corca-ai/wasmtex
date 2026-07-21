/** Whether the compile log asks for another LaTeX pass (cross-refs / bib). */
export declare function needsRerun(log: string): boolean;
export interface RerunDecision {
    rerun: boolean;
    /** When we decline to rerun despite the log asking: why we stopped. */
    stopped?: 'limit' | 'no-progress';
}
/**
 * Decides whether to auto-rerun the LaTeX compile to resolve cross-references,
 * and — crucially — guarantees termination. It caps the number of reruns and
 * detects non-convergence: if the cross-reference state (a hash of the `.aux` /
 * semantic trace) stops changing while the log still asks for a rerun, the
 * document is oscillating or stuck, so we stop instead of thrashing.
 */
export declare class RerunController {
    private maxReruns;
    private count;
    private lastSignature;
    constructor(maxReruns?: number);
    /** Reset between user edits (a fresh document state). */
    reset(): void;
    /**
     * @param log        the compile log for the just-finished pass
     * @param signature  a hash of the cross-reference state (aux / trace); use
     *                   {@link signatureOf} if you only have the raw content
     */
    decide(log: string, signature: string): RerunDecision;
}
/** Hash the cross-reference content (semantic trace or `.aux`) into a signature. */
export declare function signatureOf(content: string | undefined): string;
