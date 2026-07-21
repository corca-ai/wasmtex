import { TexliveFileEntry } from '../types';
/** Files that return 200 from the CDN and are needed for first compilation. */
export declare const PRELOAD_FILES: TexliveFileEntry[];
/**
 * Files that return 403/404 from the CDN. Pre-populating these in the
 * worker's 404 cache avoids wasted sync XHR round-trips (~75ms each).
 *
 * Note: The bloom filter (bloom-filter.bin) also prevents XHR for files
 * not on the CDN, but KNOWN_404S is still useful for the warmup() path
 * which runs before the bloom filter is loaded into the worker.
 *
 * Verified against actual Playwright console output (90 total XHR:
 * 64 Downloaded + 26 Failed).
 *
 * - 23 .vf (virtual font) lookups: pdfTeX checks for VF files when
 *   shipping out characters. Includes fonts from the .fmt and from
 *   TFM downloads. None of the CM/AMS fonts have VF files on the CDN.
 * - 3 project aux files: main.aux/toc/bbl don't exist on first compile.
 */
export declare const KNOWN_404S: TexliveFileEntry[];
