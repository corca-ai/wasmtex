/** Include databases emitted by TeX classes (e.g. REVTeX notes and ACS controls).
 * Project files retain authority; generated inputs stay in the engine filesystem.
 */
export declare function collectBibliographyInputs<T extends string | Uint8Array>(aux: string, projectFiles: Record<string, T>, readGenerated: (path: string) => Promise<string | null>): Promise<{
    bibFiles: Record<string, string | T>;
    hasGenerated: boolean;
}>;
