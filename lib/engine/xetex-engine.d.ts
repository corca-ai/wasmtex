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
    compile(): Promise<CompileResult>;
    flushCache(): Promise<void>;
    terminate(): void;
}
