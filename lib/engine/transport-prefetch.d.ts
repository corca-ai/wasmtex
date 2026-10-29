import { TexliveFileEntry } from '../types.js';
/** A response candidate, not a resolved TeX file. Installation must not create MEMFS aliases. */
export interface PrefetchedResponse extends TexliveFileEntry {
    data: ArrayBuffer;
    fileId: string | null;
}
/** Literal declarations are hints only: TeX still chooses all branches and lookup candidates. */
export declare function declaredTexFiles(source: string): TexliveFileEntry[];
/** Bounded first-compile speculation. Failures never become negative resolver entries. */
export declare function prefetchTexliveResponses(sources: Iterable<string>, baseUrl: string, signal: AbortSignal, resolved?: ReadonlySet<string>): Promise<PrefetchedResponse[]>;
