export interface CatalogIdentity {
    schemaVersion: number;
    texliveYear: string;
    mirrorRevision: string;
}
export interface CatalogTextStore {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
}
export declare class CatalogIdentityError extends Error {
}
export declare function validCatalogIdentity(value: unknown, schemaVersion: number): value is CatalogIdentity;
export declare function sameCatalogIdentity(a: CatalogIdentity, b: CatalogIdentity): boolean;
export interface ReadCatalogTextOptions {
    baseUrl: string;
    cacheNamespace: string;
    identity: CatalogIdentity;
    path: string;
    fetchImpl: typeof fetch;
    store?: CatalogTextStore;
    expectedSha256?: string;
    errorLabel: string;
}
export declare function readCatalogText(options: ReadCatalogTextOptions): Promise<string>;
