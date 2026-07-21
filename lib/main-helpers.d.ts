/**
 * Pure helpers for the demo app (`main.ts`). Extracted so the decision logic is
 * unit-testable without a DOM / `prompt()` — `main.ts` itself queries the DOM at
 * module load and cannot be imported in a test.
 */
/** Diagnostic shape the demo's panel renders. */
export interface PanelDiagnostic {
    file?: string;
    line: number;
    message: string;
    severity: string;
}
/**
 * The set the diagnostics panel shows: compile errors AND static (LSP/lint)
 * diagnostics together. Both the `compile` and `diagnostics` event handlers must
 * render this union — otherwise a compile clobbers the LSP entries (and the count).
 */
export declare function mergeDiagnostics(compileErrors: PanelDiagnostic[], lspDiagnostics: PanelDiagnostic[]): PanelDiagnostic[];
/** What the add-file action should do, decided without `prompt()`/DOM. */
export type AddFileDecision = {
    action: 'cancel';
} | {
    action: 'open';
    path: string;
} | {
    action: 'create';
    path: string;
};
/**
 * Decide the add-file flow: cancel on empty input, OPEN (never overwrite) when the
 * file already exists, else CREATE. The existence guard prevents silently replacing
 * a live file with a blank skeleton (data loss).
 */
export declare function resolveAddFile(path: string | null | undefined, fileExists: (p: string) => boolean): AddFileDecision;
