import { BibEntry } from '../lsp/types';
import { BackendRegistry, BIBTEX_STAGE } from './backend-registry';
export type BibliographyMode = 'biblatex' | 'bibtex' | 'none';
/** Detect which bibliography toolchain a LaTeX source needs. */
export declare function detectBibliographyMode(source: string): BibliographyMode;
/** @deprecated Use {@link BIBTEX_STAGE}. Biber has its own `BIBER_STAGE` contract. */
export declare const BIBLIOGRAPHY_STAGE = "bibliography:bibtex";
export { BIBTEX_STAGE };
/** What {@link WasmTexCompiler} sends to a **server** bibliography backend for the
 *  classic BibTeX flow: the `.aux` emitted by the first LaTeX pass plus the project's
 *  `.bib` databases. The backend runs BibTeX off-device and returns the `.bbl`. (Biber's
 *  biblatex flow uses the `.bcf`-based `BiberRequest` in `biber-backend.ts`, which the
 *  headless compiler drives via `runRemoteBiber` — see `maybeRunBiblatex` in `headless.ts`.) */
export interface BibliographyStageRequest {
    aux: string;
    bibFiles: Record<string, string>;
    /** Project-local custom `.bst` styles referenced by `\bibliographystyle{...}` (path →
     *  content), so a backend that can't read the project FS still finds a non-bundled style. */
    bstFiles?: Record<string, string>;
}
/**
 * Resolve the project-local `.bst` referenced by `\bibliographystyle{name}` (recorded in the
 * `.aux` as `\bibstyle{name}`). Returns the file path + content to hand BibTeX, or null when
 * there's no `\bibstyle` or the style is a bundled one not present in the project. `read`
 * looks a path up in the project FS. Extracted as a pure seam so the bst-wiring is unit-tested
 * without a WASM BibTeX engine — the client path silently dropped custom styles without it.
 */
export declare function resolveBstFile(auxContent: string, read: (path: string) => string | null): {
    path: string;
    content: string;
} | null;
/**
 * Route the bibliography stage through the backend registry: if the integrator registered
 * a **server** backend for {@link BIBTEX_STAGE}, run it and return the `.bbl`;
 * otherwise return `null` so the caller falls back to the built-in client BibTeX engine.
 *
 * This is what keeps the client-first default non-negotiable — a remote backend runs only
 * when the integrator explicitly wired one (and only sees what is routed to it). Extracted
 * from the compiler so the routing is unit-testable without a WASM engine.
 */
export declare function runRemoteBibliography(registry: BackendRegistry | undefined, request: BibliographyStageRequest): Promise<string | null>;
/** Parse the `backend=...` option of `\usepackage[...]{biblatex}` (default `biber`). */
export declare function detectBiblatexBackend(source: string): 'biber' | 'bibtex';
/** Map the biblatex `sorting=` option to the lite backend's supported schemes: `none` (cite
 *  order) or `nty` (name/title/year, the biblatex default). Any other scheme (`nyt`, `ynt`,
 *  …) falls back to `nty` — the documented-subset behavior. Comments are stripped first so a
 *  commented-out `sorting=none` doesn't win over the live option. */
export declare function detectBiblatexSort(source: string): 'nty' | 'none';
/**
 * Extract the cited keys (in citation order) from a biblatex `.bcf` control file. A biblatex
 * document records its citations as `<bcf:citekey>…</bcf:citekey>` entries in the `.bcf` (not
 * `\bibdata{}`/`\citation{}` in the `.aux`), so this is how the lite backend learns what to
 * emit. A `*` key (from `\nocite{*}`) is returned verbatim for the caller to expand to every
 * entry. Duplicate-key de-duplication is left to {@link generateBiblatexBbl}.
 */
export declare function parseBcfCitedKeys(bcf: string): string[];
export interface BblInput {
    entries: BibEntry[];
    /** Citation keys actually used in the document (in first-cite order). */
    citedKeys: string[];
    /** biblatex sorting scheme. `nty` = name/title/year; `none` = cite order. */
    sort?: 'nty' | 'none';
}
/** A pluggable bibliography backend: turns cited entries into a `.bbl`. */
export interface BibliographyBackend {
    id: string;
    /** Generate the `.bbl` contents for the cited entries. */
    generateBbl(input: BblInput): string;
}
/**
 * biblatex-lite: generate a `.bbl` for the cited entries covering the common
 * numeric/author-year subset (sorting + the core author/title/year/journal
 * fields). Documented subset — full biblatex fidelity is the Biber backend's job.
 */
export declare function generateBiblatexBbl(input: BblInput): string;
/** The bundled biblatex-lite backend. */
export declare const biblatexLiteBackend: BibliographyBackend;
/**
 * Choose a backend for a biblatex document. Hosts may pass their own backends
 * (e.g. a future Biber-WASM backend) — the first whose id matches the requested
 * preference wins, otherwise the bundled biblatex-lite backend is used.
 */
export declare function selectBiblatexBackend(backends?: BibliographyBackend[], preferredId?: string): BibliographyBackend;
