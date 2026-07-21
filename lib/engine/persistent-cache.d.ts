import { WarmupCache } from '../types';
/** Minimal async binary key→value store. */
export interface BinaryStore {
    get(key: string): Promise<ArrayBuffer | null>;
    set(key: string, value: ArrayBuffer): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
}
/** Whether a durable IndexedDB store is usable in this environment. */
export declare function isIndexedDbSupported(): boolean;
/** In-memory store — graceful fallback when IndexedDB is missing, and used in tests. */
export declare class MemoryBinaryStore implements BinaryStore {
    private map;
    get(key: string): Promise<ArrayBuffer | null>;
    set(key: string, value: ArrayBuffer): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
}
/** IndexedDB-backed binary store. Browser-only; construct behind {@link isIndexedDbSupported}. */
export declare class IndexedDbBinaryStore implements BinaryStore {
    private dbName;
    private storeName;
    private dbPromise;
    constructor(dbName?: string);
    private open;
    get(key: string): Promise<ArrayBuffer | null>;
    set(key: string, value: ArrayBuffer): Promise<void>;
    delete(key: string): Promise<void>;
    keys(): Promise<string[]>;
}
export interface PersistentCacheOptions {
    /** TeX Live year; namespaces all keys. Defaults to '2025'. */
    version?: string;
    /** Override the backing store (defaults to IndexedDB, falling back to memory). */
    store?: BinaryStore;
    /** Soft byte budget; least-recently-used files are evicted past it. */
    maxBytes?: number;
    /** Clock injection point for deterministic tests. */
    now?: () => number;
}
/**
 * Durable, versioned cache of {@link WarmupCache} contents (files + bloom + 404s)
 * with a byte budget and LRU eviction.
 */
export declare class PersistentCache {
    private store;
    readonly version: string;
    private maxBytes;
    private now;
    /** Serializes save() so overlapping persists can't lose-update the meta. */
    private writeChain;
    constructor(options?: PersistentCacheOptions);
    private metaKey;
    private fileKey;
    private bloomKey;
    private readMeta;
    private writeMeta;
    /** Rehydrate the cached WarmupCache, or null if nothing is stored for this version. */
    load(): Promise<WarmupCache | null>;
    /** Drop meta entries whose backing blob is missing, serialized behind the writeChain and
     *  re-reading the current meta so it never overwrites a file a concurrent save() recorded. */
    private prunePhantomEntries;
    /**
     * Persist a WarmupCache (merging into any existing entries), then evict past
     * the budget. Saves are serialized so concurrent fire-and-forget persists
     * can't lose-update the shared meta record.
     */
    save(cache: WarmupCache): Promise<void>;
    private doSave;
    private evict;
    /** Drop everything stored for this version. */
    clear(): Promise<void>;
}
/**
 * Clear the durable TeX Live asset cache for a given TeX Live year (default
 * '2025'). No-op when IndexedDB is unavailable. Useful for "clear cache"
 * actions without an engine instance.
 */
export declare function clearTexliveCache(options?: {
    version?: string;
}): Promise<void>;
