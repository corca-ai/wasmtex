import { TexliveVersion } from '../types';
export type EngineBinary = 'pdftex' | 'bibtex' | 'bibtex8' | 'makeindex' | 'xetex' | 'dvipdfm' | 'luatex';
export declare function engineWorkerUrl(baseUrl: string, version: TexliveVersion, binary: EngineBinary): string;
export declare function engineFormatUrl(baseUrl: string, version: TexliveVersion, binary: 'pdftex' | 'xetex' | 'luatex'): string;
