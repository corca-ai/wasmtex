/**
 * Successful runtime lookups observed with article + fontspec and Latin Modern.
 * These are optional prefetch hints, never a negative lookup authority. Fetches
 * use the selected immutable mirror and failed requests remain demand-resolved.
 * Keep the requested name distinct from its resolved filename (Lua require and
 * OpenType lookups often omit the extension). No document-local input belongs here.
 */
export declare const XETEX_PRELOAD: ({
    format: number;
    name: string;
    dir: string;
    candidate?: never;
} | {
    format: number;
    name: string;
    dir: string;
    candidate: string;
})[];
export declare const LUATEX_RUNTIME_PRELOAD: ({
    format: number;
    name: string;
    dir: string;
    candidate: string;
} | {
    format: number;
    name: string;
    dir: string;
    candidate?: never;
})[];
