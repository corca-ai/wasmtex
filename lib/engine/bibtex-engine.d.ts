import { TexliveVersion } from '../types';
import { WasmTexWorker } from './wasmtex-worker';
export declare class BibtexEngine extends WasmTexWorker {
    constructor(options?: {
        assetBaseUrl?: string;
        texliveUrl?: string;
        texliveVersion?: TexliveVersion;
    });
    compile(auxBaseName: string): Promise<{
        success: boolean;
        log: string;
    }>;
}
