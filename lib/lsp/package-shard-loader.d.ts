import { CommandArg } from './package-db';
export interface ShardCommand {
    name: string;
    args?: CommandArg[];
    doc?: string;
}
export interface PackageShard {
    package: string;
    commands: ShardCommand[];
    environments?: ShardCommand[];
}
/** Minimal async string store (e.g. an IndexedDB-backed cache). */
export interface ShardStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}
export interface PackageShardLoaderOptions {
    /** Base URL for shards; the loader fetches `${baseUrl}/${name}.json`. */
    baseUrl: string;
    /** Override fetch (for tests / non-browser hosts). */
    fetchImpl?: typeof fetch;
    /** Durable cache so a shard fetched once is available offline. */
    store?: ShardStore;
}
export declare class PackageShardLoader {
    private baseUrl;
    private fetchImpl;
    private store;
    /** In-flight or completed load per package — cached so each is fetched once. */
    private resolved;
    constructor(options: PackageShardLoaderOptions);
    /** Load shards for the given packages (each fetched at most once). */
    loadAll(packages: Iterable<string>): Promise<void>;
    /** Load (and register) a single package's shard, from cache or network. */
    load(pkg: string): Promise<PackageShard | null>;
    private resolve;
    private fromStore;
    private fromNetwork;
    private key;
}
