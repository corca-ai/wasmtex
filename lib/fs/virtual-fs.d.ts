import { VirtualFile } from '../types';
interface VirtualFSOptions {
    /** If true, start with no files (skip default main.tex template). */
    empty?: boolean;
}
export declare class VirtualFS {
    private files;
    private listeners;
    constructor(options?: VirtualFSOptions);
    writeFile(path: string, content: string | Uint8Array): void;
    readFile(path: string): string | Uint8Array | null;
    deleteFile(path: string): boolean;
    listFiles(): string[];
    getFile(path: string): VirtualFile | undefined;
    /** Get files that have been modified since last sync */
    getModifiedFiles(): VirtualFile[];
    /**
     * Mark files as synced. When `files` is given, only those exact objects are
     * cleared (by identity) — this avoids clearing the `modified` flag of an edit
     * that arrived (replacing the map entry) after the caller captured the set it
     * actually synced. With no argument, every current file is marked synced.
     */
    markSynced(files?: Iterable<VirtualFile>): void;
    /**
     * Mark every current file as modified so the next sync re-sends all of them.
     * Used after an engine cache flush (which wipes the engine's whole file set):
     * without this, files already marked synced would never be re-written and the
     * next compile would run against an empty engine filesystem.
     */
    markAllModified(): void;
    onChange(listener: () => void): () => void;
    private notify;
}
export {};
