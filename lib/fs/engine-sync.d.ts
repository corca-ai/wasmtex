import { VirtualFile } from '../types';
/** Minimal file store the full sync needs (a subset of {@link VirtualFS}). */
export interface SyncFileStore {
    listFiles(): string[];
    getFile(path: string): VirtualFile | undefined;
    markSynced(files: Iterable<VirtualFile>): void;
}
/** Minimal engine sink the full sync writes through. */
export interface SyncEngineSink {
    writeFile(path: string, content: string | Uint8Array): Promise<void>;
    setMainFile(mainFile: string): void;
}
/**
 * Write every project file to the engine, then mark **only the files actually
 * written** as synced (by identity), and set the main file.
 *
 * A host edit that replaces a file's map entry during the awaits must stay
 * `modified` so the next cycle re-sends it — clearing every file's flag (a bare
 * `markSynced()`) would silently drop that edit. Shared by the UI (`WasmTex.init`)
 * and headless (`WasmTexCompiler`) full-sync paths so the two cannot drift.
 */
export declare function syncAllFilesToEngine(fs: SyncFileStore, engine: SyncEngineSink, ensureDirectories: (paths: string[]) => Promise<void>, mainFile: string): Promise<void>;
