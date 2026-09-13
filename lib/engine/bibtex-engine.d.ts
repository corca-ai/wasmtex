import { TexliveVersion } from '../types.js';
import { WasmTexWorker } from './wasmtex-worker.js';
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
