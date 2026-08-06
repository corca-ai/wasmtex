import { completionFileDigest } from './completion-snapshot';
import { BinaryStore } from './persistent-cache';
export interface PreambleCacheIdentity {
    engineBuildId: string;
    mirrorRevision: string;
    texliveUrl: string;
    texliveYear: string;
}
export interface PreambleProjectDependency {
    path: string;
    sha256: string;
}
export interface DurablePreambleSnapshot {
    key: string;
    workerHash: string;
    format: ArrayBuffer;
    inputFiles: string[];
    projectDependencies: PreambleProjectDependency[];
}
export interface PreambleSnapshotCacheOptions {
    store?: BinaryStore;
    maxBytes?: number;
    now?: () => number;
}
export declare const preambleSha256: typeof completionFileDigest;
export declare function durablePreambleKey(identity: PreambleCacheIdentity, preamble: string): Promise<string>;
/** Bounded persistent store for document-specific pdfLaTeX preamble formats. */
export declare class PreambleSnapshotCache {
    private readonly store;
    private readonly maxBytes;
    private readonly now;
    private writeChain;
    constructor(options?: PreambleSnapshotCacheOptions);
    private indexKey;
    private metaKey;
    private formatKey;
    private readIndex;
    private writeIndex;
    load(key: string): Promise<DurablePreambleSnapshot | null>;
    save(snapshot: DurablePreambleSnapshot): Promise<void>;
    private doSave;
    private evict;
    private delete;
    clear(): Promise<void>;
}
