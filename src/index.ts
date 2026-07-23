export * from './backend-api'
export type { WasmTexEventMap, WasmTexOptions } from './component-types'
export { ensureLanguagesRegistered } from './editor/setup'
export {
  clearTexliveCache,
  isIndexedDbSupported,
  PersistentCache,
  type PersistentCacheOptions,
} from './engine/persistent-cache'
export { warmup } from './engine/warmup'
export { wasmSimdSupported } from './engine/wasm-features'
export {
  DEFAULT_LINT_CONFIG,
  type LintConfig,
  type LintRuleConfig,
  type LintRuleId,
  lintSource,
} from './lsp/linter'
export {
  type CommandArg,
  formatSignature,
  getCommandPackage,
  getCommandSignature,
  parseSignature,
  registerShard,
} from './lsp/package-db'
export {
  type PackageShard,
  PackageShardLoader,
  type PackageShardLoaderOptions,
  type ShardStore,
} from './lsp/package-shard-loader'
export type {
  AppStatus,
  BoxGeometry,
  CachedTexliveFile,
  CompileResult,
  DependencyEdge,
  DependencyGraph,
  DependencyManifest,
  DependencyManifestCoverage,
  DependencyManifestIncompleteReason,
  DependencyManifestSource,
  DependencyManifestStage,
  DependencyNode,
  Diagnostic,
  DiagnosticCode,
  DocumentGeometry,
  EngineTelemetry,
  FontGlyphGap,
  GlyphCoverageReport,
  GlyphMiss,
  PageGeometry,
  TexError,
  TextRun,
  WarmupCache,
} from './types'
export { WasmTex } from './wasmtex'
