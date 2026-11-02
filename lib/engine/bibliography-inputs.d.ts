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
