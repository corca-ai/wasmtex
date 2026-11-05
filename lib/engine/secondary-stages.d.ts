/**
 * What a document asks of makeindex and BibTeX beyond `\jobname.idx` and `\jobname.aux`.
 * latexmk users write these rules by hand, and Overleaf ships them as defaults; without
 * them nomenclature, glossaries, extra indexes and extra bibliographies come out empty
 * with no error.
 */
export interface IndexJob {
    input: string;
    output: string;
    /** A TeX Live style, or one LaTeX wrote next to the document. */
    style?: string;
    log?: string;
    letterOrder?: boolean;
}
export declare function secondaryIndexJobs(mainBase: string, sources: string[], aux: string): IndexJob[];
/** Aux files BibTeX runs on by name: multibib's lists and chapterbib's chapters. bibunits
 *  numbers its units, so {@link usesBibunits} tells the caller to read until one is missing. */
export declare function secondaryAuxBases(sources: string[], aux: string): string[];
export declare function usesBibunits(sources: string[]): boolean;
