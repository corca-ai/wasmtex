/**
 * Successful runtime lookups observed with article + fontspec and Latin Modern.
 * These are optional prefetch hints, never a negative lookup authority. Fetches
 * use the selected immutable mirror and failed requests remain demand-resolved.
 * Only canonical filenames may be materialized: extensionless aliases would
 * change unrelated TeX file-existence checks. No document-local input belongs here.
 */
export declare const XETEX_PRELOAD: {
    format: number;
    name: string;
    dir: string;
}[];
export declare const LUATEX_RUNTIME_PRELOAD: {
    format: number;
    name: string;
    dir: string;
}[];
