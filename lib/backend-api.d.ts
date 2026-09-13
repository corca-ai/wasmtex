/** Headless-safe public exports for pluggable compile-stage backends. */
export { BackendRegistry, type BackendStageContract, BIBER_STAGE, BIBTEX_STAGE, createJsonTextBackend, createRemoteBackend, INDEX_STAGE, type JsonTextBackendOptions, type RemoteBackendOptions, type ToolBackend, type WasmTexBackendStages, } from './engine/backend-registry.js';
export { type BiberBackendOptions, type BiberRequest, createBiberBackend, runRemoteBiber, } from './engine/biber-backend.js';
export { type BblInput, BIBLIOGRAPHY_STAGE, type BibliographyBackend, type BibliographyMode, type BibliographyStageRequest, biblatexLiteBackend, detectBiblatexBackend, detectBiblatexSort, detectBibliographyMode, generateBiblatexBbl, parseBcfCitedKeys, runRemoteBibliography, selectBiblatexBackend, } from './engine/bibliography-backend.js';
export { type BackendCacheIdentity, backendCacheKey, type CacheStore, contentKey, MemoryCacheStore, type WithCacheOptions, withCache, } from './engine/content-cache.js';
export { createMakeindexBackend, detectIndexUse, type IndexStageRequest, type MakeindexBackendOptions, runRemoteIndex, } from './engine/index-backend.js';
export { createXindyBackend, type XindyBackendOptions, type XindyRequest, } from './engine/xindy-backend.js';
