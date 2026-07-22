/**
 * `wasmtex/node` — the Node (server) entry. Runs the same headless engine off-browser
 * via a `worker_threads` host adapter (#121, execution-model principle 1).
 *
 *   import { installNodeWorkerHost, WasmTexCompiler } from 'wasmtex/node'
 *   installNodeWorkerHost({ publicDir, assetBaseUrl })
 *   const c = new WasmTexCompiler({ engine: 'pdflatex', assetBaseUrl, texliveUrl, files })
 *   await c.init(); const { pdf } = await c.compile()
 */
export { installNodeWorkerHost, type NodeWorkerHostInstallation, type NodeWorkerHostOptions, } from './engine/node-host';
export { WasmTexCompiler, type WasmTexCompilerOptions } from './headless';
export type { CompileResult } from './types';
