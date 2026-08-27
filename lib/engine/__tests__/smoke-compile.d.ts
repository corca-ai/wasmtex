/**
 * Shared Node-host compile helper for the opt-in engine smokes (`*.smoke.test.ts`). Spins
 * up the real WASM engine off-browser against the live TeX Live CDN and returns the pieces
 * the smokes assert on. Kept in one place so the smokes don't each re-declare it (cpd).
 *
 * Not a vitest target (no `.test` suffix, no `describe`/`it`); only imported by the smokes.
 */
export declare const SMOKE_TEXLIVE: string;
/** A pdfLaTeX document of `n` `\clearpage`-separated sections, each with a replaceable plain-text
 *  marker; the last section's marker is `lastMarker`. Editing only the last marker is a servable
 *  final tail edit — the shared corpus for the incremental / SyncTeX-splice smokes. */
export declare function buildSectionedDoc(lastMarker: string, n?: number): string;
export interface SmokeCompileResult {
    success: boolean;
    pdfBytes: number;
    log: string;
    errors: Array<{
        message: string;
        severity: string;
    }>;
}
export declare function smokeCompile(files: Record<string, string>, texliveUrl?: string): Promise<SmokeCompileResult>;
