/**
 * `wasmtex/node` — the Node (server) entry. Runs the same headless engine off-browser
 * via a `worker_threads` host adapter (#121, execution-model principle 1).
 *
 *   import { installNodeWorkerHost, WasmTexCompiler } from 'wasmtex/node'
 *   installNodeWorkerHost({ publicDir, assetBaseUrl })
 *   const c = new WasmTexCompiler({ engine: 'pdflatex', assetBaseUrl, texliveUrl, files })
 *   await c.init(); const { pdf } = await c.compile()
 */
export {
  installNodeWorkerHost,
  type NodeWorkerHostInstallation,
  type NodeWorkerHostOptions,
} from './engine/node-host'
export {
  COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
  COMPLETION_SNAPSHOT_SCHEMA_VERSION,
  WasmTexCompiler,
  type WasmTexCompilerOptions,
} from './headless'
export type {
  CompilePhaseTimings,
  CompileResult,
  CompletionSnapshot,
  CompletionSnapshotCollection,
  CompletionSnapshotCommand,
  CompletionSnapshotEngine,
  CompletionSnapshotEvidence,
  CompletionSnapshotFieldName,
  CompletionSnapshotFields,
  CompletionSnapshotIdentity,
  CompletionSnapshotKey,
  CompletionSnapshotKeyFamily,
  CompletionSnapshotProfile,
  CompletionSnapshotResource,
  CompletionSnapshotState,
  CompletionSnapshotValue,
  DependencyManifest,
  DependencyManifestCoverage,
  DependencyManifestIncompleteReason,
  DependencyManifestSource,
  DependencyManifestStage,
} from './types'
