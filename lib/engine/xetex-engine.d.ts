import { CompileResult } from '../types.js';
import { AssetDownloadSession } from './asset-download.js';
import { BaseTexFmtEngine, ChapterPreviewResult } from './tex-fmt-engine.js';
import { WasmTexEngineOptions } from './wasmtex-engine.js';
import { CompileWorkerDriver } from './wasmtex-worker.js';
/**
 * Stop after `pageLimit` shipped pages. XeTeX has no `tex.finish()`, and `\\end`
 * is not allowed inside the output routine. Reading from the terminal in batch
 * mode is a fatal error instead: XeTeX then closes its files and writes the XDV
 * postamble. The empty line ends the transcript's last line first, and batch mode
 * keeps the stop out of the transcript the SDK parses. The hook precedes the
 * author's first line on that same line, so diagnostics keep their line numbers.
 */
export declare function xetexPreviewHook(pageLimit: number, chapter?: {
    name: string;
    cap: number;
}): string;
export declare class WasmTexXetexEngine extends BaseTexFmtEngine {
    private dvipdfm;
    /** Aux files outside the job name (`\\include`d chapters) as the last full pass left
     *  them. XeTeX cannot redirect a preview's writes, so each preview restores them. */
    private chapterAux;
    constructor(options?: WasmTexEngineOptions);
    setAssetDownloadSession(session: AssetDownloadSession): void;
    init(): Promise<void>;
    /** dvipdfmx fetches+embeds fonts the primary XeTeX worker never caches — persist them too. */
    protected extraCacheDrivers(): CompileWorkerDriver[];
    /** Project files must exist in BOTH workers: XeTeX only records an image
     *  reference in the XDV; dvipdfmx re-opens the actual file (`\includegraphics`,
     *  `pdfpages` imports) from its own FS when embedding. */
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    mkdir(path: string): Promise<void>;
    compile(): Promise<CompileResult>;
    private keepChapterAux;
    /** Typeset only pages 1..`pageLimit` of the current main source, or only the
     *  `\\include`d `chapter`, as a separate job (see {@link runPreviewJob}) and convert
     *  just those pages; null means run {@link compile} instead. */
    compilePagePreview(pageLimit: number, { chapter, cold }?: {
        chapter?: string;
        cold?: boolean;
    }): Promise<ChapterPreviewResult | null>;
    /** XeTeX emits the job's basename in /work even for nested source files.
     *  Preserve that name when transferring XDV: dvipdfmx's C entry retains the
     *  supplied directory in -o, while its worker reads the job basename (#135). */
    private convert;
    flushCache(): Promise<void>;
    terminate(): void;
}
