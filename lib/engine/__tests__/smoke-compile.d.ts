/**
 * Shared Node-host compile helper for the opt-in engine smokes (`*.smoke.test.ts`). Spins
 * up the real WASM engine off-browser against the live TeX Live CDN and returns the pieces
 * the smokes assert on. Kept in one place so the smokes don't each re-declare it (cpd).
 *
 * Not a vitest target (no `.test` suffix, no `describe`/`it`); only imported by the smokes.
 */
export declare const SMOKE_TEXLIVE = "https://d1jectpaw0dlvl.cloudfront.net/2025/";
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
