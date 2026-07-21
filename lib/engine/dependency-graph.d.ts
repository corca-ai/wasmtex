import { DependencyGraph } from '../types';
export interface DependencyOpts {
    /** pdfTeX `.fls` input list (`CompileResult.inputFiles`). */
    inputFiles?: string[] | undefined;
    /** Font basenames used by the document (from the XeTeX XDV). */
    fonts?: string[] | undefined;
    /** Main source content, for `\usepackage`/`\input` declared dependencies. */
    source?: string | undefined;
}
/** Build the compile dependency graph from the log, enriched with any of the optional
 *  per-engine signals (#54 slice 4). */
export declare function buildDependencyGraph(log: string, opts?: DependencyOpts): DependencyGraph;
