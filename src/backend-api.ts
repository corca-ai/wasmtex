/** Headless-safe public exports for pluggable compile-stage backends. */
export {
  BackendRegistry,
  createJsonTextBackend,
  createRemoteBackend,
  type JsonTextBackendOptions,
  type RemoteBackendOptions,
  type ToolBackend,
} from './engine/backend-registry'
export {
  type BiberBackendOptions,
  type BiberRequest,
  createBiberBackend,
  runRemoteBiber,
} from './engine/biber-backend'
export {
  type BblInput,
  BIBLIOGRAPHY_STAGE,
  type BibliographyBackend,
  type BibliographyMode,
  type BibliographyStageRequest,
  biblatexLiteBackend,
  detectBiblatexBackend,
  detectBiblatexSort,
  detectBibliographyMode,
  generateBiblatexBbl,
  parseBcfCitedKeys,
  runRemoteBibliography,
  selectBiblatexBackend,
} from './engine/bibliography-backend'
export {
  type BackendCacheIdentity,
  backendCacheKey,
  type CacheStore,
  contentKey,
  MemoryCacheStore,
  type WithCacheOptions,
  withCache,
} from './engine/content-cache'
export {
  createMakeindexBackend,
  detectIndexUse,
  INDEX_STAGE,
  type IndexStageRequest,
  type MakeindexBackendOptions,
  runRemoteIndex,
} from './engine/index-backend'
export {
  createXindyBackend,
  type XindyBackendOptions,
  type XindyRequest,
} from './engine/xindy-backend'
