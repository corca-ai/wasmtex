import { CompileResult } from '../types';
import { BaseTexFmtEngine } from './tex-fmt-engine';
import { WasmTexEngineOptions } from './wasmtex-engine';
import { CompileWorkerDriver } from './wasmtex-worker';
export declare class WasmTexXetexEngine extends BaseTexFmtEngine {
    private dvipdfm;
    constructor(options?: WasmTexEngineOptions);
    init(): Promise<void>;
    /** dvipdfmx fetches+embeds fonts the primary XeTeX worker never caches — persist them too. */
    protected extraCacheDrivers(): CompileWorkerDriver[];
    /** Project files must exist in BOTH workers: XeTeX only records an image
     *  reference in the XDV; dvipdfmx re-opens the actual file (`\includegraphics`,
     *  `pdfpages` imports) from its own FS when embedding. */
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    mkdir(path: string): Promise<void>;
    compile(): Promise<CompileResult>;
    flushCache(): Promise<void>;
    terminate(): void;
}
