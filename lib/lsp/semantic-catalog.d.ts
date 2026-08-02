import { CompletionCancellationToken, CompletionResolverRegistry } from './completion-registry';
import { CommandArg } from './package-db';
export declare const TEX_SEMANTIC_CATALOG_SCHEMA_VERSION = 1;
export type TexSemanticScopeKind = 'class' | 'package';
export type TexSemanticConfidence = 'exact' | 'observed' | 'inferred' | 'overridden';
export type TexSemanticEvidence = 'declared' | 'observed' | 'inferred' | 'override';
export type TexSemanticValueType = 'flag' | 'boolean' | 'enum' | 'number' | 'dimension' | 'color' | 'file' | 'command' | 'free-text' | 'tex-class' | 'tex-package' | 'bib-style' | 'biblatex-style' | 'font-family';
export interface TexSemanticCatalogIdentity {
    schemaVersion: 1;
    texliveYear: string;
    mirrorRevision: string;
}
export interface TexSemanticProvenance {
    evidence: TexSemanticEvidence;
    sourcePath: string;
    line?: number;
    extractor: string;
    note?: string;
}
export interface TexSemanticValue {
    type: TexSemanticValueType;
    values?: string[];
}
export interface TexSemanticKey {
    name: string;
    value: TexSemanticValue;
    repeatable: boolean;
    default?: string;
    documentation?: string;
    confidence: TexSemanticConfidence;
    provenance: TexSemanticProvenance[];
}
export interface TexSemanticKeyFamily {
    name: string;
    keys: TexSemanticKey[];
}
export interface TexSemanticCommand {
    name: string;
    args: CommandArg[];
    doc?: string;
    confidence: TexSemanticConfidence;
    provenance: TexSemanticProvenance[];
}
export interface TexSemanticColor {
    name: string;
    kind: 'define' | 'provide' | 'alias';
    model?: string;
    value?: string;
    alias?: string;
    availability?: {
        anyOptions?: string[];
        deferredOptions?: string[];
    };
    priority?: number;
    confidence: TexSemanticConfidence;
    provenance: TexSemanticProvenance[];
}
export interface TexSemanticScope {
    id: string;
    kind: TexSemanticScopeKind;
    name: string;
    fileName: string;
    key: string;
    sourcePath: string;
    texlivePackage: string;
    packageRevision: string | null;
    catalogue: string | null;
    documentationUrl?: string;
    engines?: Array<'pdftex' | 'xetex' | 'luatex'>;
}
export interface TexSemanticCoverage {
    keys: number;
    commands: number;
    environments: number;
    colors: number;
    exact: number;
    declared: number;
    observed: number;
    inferred: number;
    overridden: number;
    unresolved: number;
}
export interface TexSemanticShard extends TexSemanticCatalogIdentity {
    scope: TexSemanticScope;
    keyFamilies: TexSemanticKeyFamily[];
    commands: TexSemanticCommand[];
    environments: TexSemanticCommand[];
    colors: TexSemanticColor[];
    dependencies: string[];
    unsupported: Array<{
        line?: number;
        construct: string;
        reason: string;
    }>;
    coverage: TexSemanticCoverage;
}
export type TexSemanticCatalogState = {
    status: 'idle';
} | {
    status: 'loading';
} | {
    status: 'ready';
    shard: TexSemanticShard;
} | {
    status: 'absent';
    message: string;
} | {
    status: 'mismatch';
    message: string;
} | {
    status: 'error';
    message: string;
};
export interface TexSemanticCatalogProvider {
    readonly identity: TexSemanticCatalogIdentity;
    getState(scopeId: string): TexSemanticCatalogState;
    load(scopeId: string, cancellationToken?: CompletionCancellationToken): Promise<TexSemanticCatalogState>;
    subscribe?(listener: () => void): () => void;
}
export interface TexSemanticCatalogStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}
export interface HttpTexSemanticCatalogProviderOptions {
    /** TeX Live year root, for example `https://cdn.example/2025/`. */
    baseUrl: string;
    /** Exact compile-profile identity. A different response is rejected. */
    identity: TexSemanticCatalogIdentity;
    fetchImpl?: typeof fetch;
    store?: TexSemanticCatalogStore;
}
export declare class HttpTexSemanticCatalogProvider implements TexSemanticCatalogProvider {
    readonly identity: TexSemanticCatalogIdentity;
    private baseUrl;
    private fetchImpl;
    private store;
    private states;
    private pending;
    private indexPromise;
    private listeners;
    constructor(options: HttpTexSemanticCatalogProviderOptions);
    getState(scopeId: string): TexSemanticCatalogState;
    load(scopeId: string, cancellationToken?: CompletionCancellationToken): Promise<TexSemanticCatalogState>;
    subscribe(listener: () => void): () => void;
    private setState;
    private loadShard;
    private loadIndex;
    private read;
}
export declare class InMemoryTexSemanticCatalogProvider implements TexSemanticCatalogProvider {
    readonly identity: TexSemanticCatalogIdentity;
    private shards;
    constructor(identity: TexSemanticCatalogIdentity, shards: Iterable<TexSemanticShard>);
    getState(scopeId: string): TexSemanticCatalogState;
    load(scopeId: string): Promise<TexSemanticCatalogState>;
}
export declare function registerTexSemanticShard(registry: CompletionResolverRegistry, shard: TexSemanticShard): void;
