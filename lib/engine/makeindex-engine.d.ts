import { TexliveVersion } from '../types';
import { WasmTexWorker } from './wasmtex-worker';
/**
 * The bundled from-source makeindex (#115), driving the WasmTex worker protocol. Turns a
 * `<base>.idx` (emitted by a LaTeX
 * pass when `\makeindex` is active) into `<base>.ind` so `\printindex` resolves, fully
 * client-side. Runs identically under the Node host (#121), same as the proven engines.
 */
export declare class MakeindexEngine extends WasmTexWorker {
    constructor(options?: {
        assetBaseUrl?: string;
        texliveUrl?: string;
        texliveVersion?: TexliveVersion;
    });
    /** Process `<idxBaseName>.idx` → `<idxBaseName>.ind` (+ `.ilg` log). The worker reads the
     *  `.idx` from its MEMFS (write it first) and replies under the shared `cmd:compile` key. */
    compile(idxBaseName: string): Promise<{
        success: boolean;
        log: string;
    }>;
}
