/**
 * Compatibility failure classifier.
 *
 * Turns a raw pdfTeX/LaTeX compile result (status + log) into a single root-cause
 * {@link FailureClass} plus the supporting evidence. It is the analytical core of
 * the compatibility harness (`scripts/compat/run.mjs`): it converts thousands of
 * opaque compile logs into a ranked, actionable backlog ("X% fail because they
 * need XeLaTeX", "Y% are missing a package", …).
 *
 * Pure and dependency-free so it can run in Node (the harness), in the browser,
 * and under Vitest. It is intentionally *not* re-exported from any library entry
 * point, so it never ships in the published bundle.
 */
/** Root-cause buckets, ordered loosely from most specific to most generic. */
export type FailureClass = 'ok' | 'needs-xelatex-lualatex' | 'needs-biber' | 'needs-shell-escape' | 'image-format' | 'missing-package' | 'missing-font' | 'missing-file' | 'memory-exhausted' | 'undefined-control-sequence' | 'compile-timeout' | 'engine-crash' | 'tex-error' | 'unknown';
export interface ClassifyInput {
    /** Engine-reported success (pdfTeX status 0 or 1). */
    success: boolean;
    /** Whether a PDF was produced (a doc can "succeed" enough to emit a PDF). */
    hasPdf: boolean;
    /** Raw compile log. */
    log: string;
    /** Runner-level signal: the compile exceeded the wall-clock budget. */
    timedOut?: boolean;
    /** Runner-level signal: the worker died / aborted with no usable log. */
    crashed?: boolean;
}
export interface ClassifyResult {
    /** The single best root-cause bucket. */
    class: FailureClass;
    /** Short human-readable explanation. */
    summary: string;
    /** Log fragments / tokens that triggered the classification. */
    evidence: string[];
    /** Every bucket that matched (a document can have several causes). */
    signals: FailureClass[];
    /** For missing-* buckets: the specific package/font/file names involved. */
    missing: string[];
}
/**
 * Classify a compile result into a single root cause plus evidence.
 *
 * Precedence: runner signals (timeout/crash) → success → the ordered {@link RULES}
 * (most specific first). The first matching rule is the primary class; every rule
 * that matched is reported in `signals` so multi-cause documents stay visible.
 */
export declare function classifyCompile(input: ClassifyInput): ClassifyResult;
/** Stable ordering for report rendering (most actionable first). */
export declare const FAILURE_CLASS_ORDER: FailureClass[];
