import { CompileResult } from '../types';
import { BaseTexFmtEngine } from './tex-fmt-engine';
import { WasmTexEngineOptions } from './wasmtex-engine';
export declare class WasmTexLuatexEngine extends BaseTexFmtEngine {
    constructor(options?: WasmTexEngineOptions);
    init(): Promise<void>;
    compile(): Promise<CompileResult>;
    flushCache(): Promise<void>;
    terminate(): void;
}
