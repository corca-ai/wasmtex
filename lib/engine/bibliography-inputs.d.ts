/** Include databases emitted by TeX classes (e.g. REVTeX notes and ACS controls).
 * Project files retain authority; generated inputs stay in the engine filesystem.
 */
export declare function collectBibliographyInputs<T extends string | Uint8Array>(aux: string, projectFiles: Record<string, T>, readGenerated: (path: string) => Promise<string | null>): Promise<{
    bibFiles: Record<string, string | T>;
    hasGenerated: boolean;
}>;
/** Inline the `\@input{…}` auxiliary files BibTeX follows: each `\include`d chapter
 * writes its own citations, which BibTeX reads only through the main `.aux`. Reads
 * share the bounded, path-checked walk of {@link readAuxFiles}; a missing or
 * repeated file contributes nothing, as BibTeX skips it. */
export declare function flattenAuxInputs(root: string, read: (path: string) => Promise<string | null>): Promise<string | null>;
/** Everything a bibliography backend reads: its control input (BibTeX's aux commands or
 * biblatex's `.bcf`) and each database/style it receives. Values keep VFS references, so
 * retaining one costs no copy. */
export interface BibliographyInput {
    control: string;
    files: Record<string, string | Uint8Array>;
}
/** BibTeX ignores every aux line except these commands; prose edits that move labels
 * therefore leave the request unchanged. */
export declare function bibtexControl(aux: string): string;
export declare function sameBibliographyInput(a: BibliographyInput, b: BibliographyInput): boolean;
