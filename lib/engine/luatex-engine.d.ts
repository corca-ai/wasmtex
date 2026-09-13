import { CompileResult } from '../types.js';
import { BaseTexFmtEngine } from './tex-fmt-engine.js';
import { WasmTexEngineOptions } from './wasmtex-engine.js';
export declare class WasmTexLuatexEngine extends BaseTexFmtEngine {
    constructor(options?: WasmTexEngineOptions);
    init(): Promise<void>;
    compile(): Promise<CompileResult>;
    flushCache(): Promise<void>;
    terminate(): void;
}
