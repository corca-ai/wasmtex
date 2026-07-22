export interface NodeWorkerHostOptions {
    /** Local directory holding the engine assets (the project's `public/`). The worker/module JS,
     *  generated module JS and `.wasm` are loaded from here; `.fmt`/bloom fetches under
     *  `assetBaseUrl` are served
     *  from here too. */
    publicDir: string;
    /** The `assetBaseUrl` passed to `WasmTexCompiler`. Fetches that start with it are
     *  served from `publicDir`; everything else (the TeX Live CDN) passes through. */
    assetBaseUrl: string;
    /** Wrapped fetch (defaults to the global). */
    baseFetch?: typeof fetch;
}
/** Resources installed globally by {@link installNodeWorkerHost}. Dispose this only after
 *  all compilers using the host have been disposed. */
export interface NodeWorkerHostInstallation {
    /** Restore the previous global `fetch` and worker factory. Idempotent. */
    dispose(): void;
}
/**
 * Install the Node worker host: a `worker_threads` engine-worker factory + an asset
 * `fetch` shim that serves `assetBaseUrl` files from `publicDir`. Call once before
 * constructing any `WasmTexCompiler`. The returned handle restores both globals when
 * disposed, so tests and multi-tenant Node processes do not retain the adapter forever.
 */
export declare function installNodeWorkerHost(opts: NodeWorkerHostOptions): NodeWorkerHostInstallation;
