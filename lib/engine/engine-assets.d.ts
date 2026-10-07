import { TexliveVersion } from '../types.js';
export type EngineBinary = 'pdftex' | 'bibtex' | 'bibtex8' | 'makeindex' | 'xetex' | 'dvipdfm' | 'luatex';
export declare function engineWorkerUrl(baseUrl: string, version: TexliveVersion, binary: EngineBinary): string;
export declare function engineFormatUrl(baseUrl: string, version: TexliveVersion, binary: 'pdftex' | 'xetex' | 'luatex'): string;
/** Formats can retain their published source while a compatible engine is upgraded. */
export declare function formatAssetBase(baseUrl: string, override?: string): string;
/** Absolute, normalized identity where the host provides a base for relative URLs. */
export declare function normalizedFormatUrl(url: string, override?: string): string | undefined;
