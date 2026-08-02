import { CompletionCancellationToken } from './completion-registry';
export declare const TEX_RESOURCE_CATALOG_SCHEMA_VERSION = 1;
export type TexResourceKind = 'tex-class' | 'tex-package' | 'bib-style' | 'biblatex-style' | 'font-file';
export interface TexResourceCatalogIdentity {
    schemaVersion: 1;
    texliveYear: string;
    mirrorRevision: string;
}
export interface TexResourceRecord {
    name: string;
    fileName: string;
    extension: string;
    key: string;
    format: number;
    bytes: number;
    sha256: string;
    texliveYear: string;
    mirrorRevision: string;
    sourcePath: string;
    texlivePackage: string;
    packageRevision: string | null;
    catalogue: string | null;
    documentationUrl?: string;
    engines?: Array<'pdftex' | 'xetex' | 'luatex'>;
    collision?: {
        decision: 'identical-content' | 'reviewed-override';
        selectedSource: string;
        candidateSources: string[];
        rationale?: string;
    };
}
export interface TexResourceCatalogShard extends TexResourceCatalogIdentity {
    kind: TexResourceKind;
    resources: TexResourceRecord[];
}
export type TexResourceCatalogState = {
    status: 'idle';
} | {
    status: 'loading';
} | {
    status: 'ready';
    shard: TexResourceCatalogShard;
} | {
    status: 'mismatch';
    message: string;
} | {
    status: 'error';
    message: string;
};
export interface TexResourceCatalogProvider {
    readonly identity: TexResourceCatalogIdentity;
    getState(kind: TexResourceKind): TexResourceCatalogState;
    load(kind: TexResourceKind, cancellationToken?: CompletionCancellationToken): Promise<TexResourceCatalogState>;
    subscribe?(listener: () => void): () => void;
}
export interface TexResourceCatalogStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}
export interface HttpTexResourceCatalogProviderOptions {
    /** TeX Live year root, for example `https://cdn.example/2025/`. */
    baseUrl: string;
    /** Exact compile-profile identity. A different response is rejected. */
    identity: TexResourceCatalogIdentity;
    fetchImpl?: typeof fetch;
    store?: TexResourceCatalogStore;
}
export declare class HttpTexResourceCatalogProvider implements TexResourceCatalogProvider {
    readonly identity: TexResourceCatalogIdentity;
    private baseUrl;
    private fetchImpl;
    private store;
    private states;
    private pending;
    private indexPromise;
    private listeners;
    constructor(options: HttpTexResourceCatalogProviderOptions);
    getState(kind: TexResourceKind): TexResourceCatalogState;
    load(kind: TexResourceKind, cancellationToken?: CompletionCancellationToken): Promise<TexResourceCatalogState>;
    subscribe(listener: () => void): () => void;
    private setState;
    private loadShard;
    private loadIndex;
    private read;
}
export declare class InMemoryTexResourceCatalogProvider implements TexResourceCatalogProvider {
    readonly identity: TexResourceCatalogIdentity;
    private shards;
    constructor(identity: TexResourceCatalogIdentity, shards: Iterable<TexResourceCatalogShard>);
    getState(kind: TexResourceKind): TexResourceCatalogState;
    load(kind: TexResourceKind): Promise<TexResourceCatalogState>;
}
