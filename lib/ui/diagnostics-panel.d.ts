/** A diagnostic carrying at least a severity ('error' | 'warning' | 'info'). */
export interface SeverityEntry {
    severity: string;
}
/** Whether the diagnostics panel should be open. It opens only for true
 *  problems — error- or warning-severity diagnostics. Info-only diagnostics
 *  (e.g. unused-bib-entry, unreferenced-label) keep it collapsed. */
export declare function hasErrorsOrWarnings(diagnostics: SeverityEntry[]): boolean;
