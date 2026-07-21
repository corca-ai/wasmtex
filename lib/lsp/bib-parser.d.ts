import { ProjectIndex } from './project-index';
import { BibEntry } from './types';
/** Minimal file source: enough of a VirtualFS to find and read `.bib` files. */
export interface BibFileReader {
    listFiles(): string[];
    readFile(path: string): string | Uint8Array | null;
}
/** Re-parse every `.bib` file in `fs` and load the entries into `index`. Shared by
 *  the headless core and the standalone language service so the wiring lives once. */
export declare function rebuildBibIndex(fs: BibFileReader, index: ProjectIndex): void;
export declare function parseBibFile(content: string, filePath: string): BibEntry[];
/** Render a formatted reference preview (author, year, title, venue) for hover. */
export declare function formatReference(entry: BibEntry): string;
