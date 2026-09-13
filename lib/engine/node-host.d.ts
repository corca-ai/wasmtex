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
    /** Release this host's factory and restore fetch if still owned. Idempotent. */
    dispose(): void;
}
/**
 * Install the Node worker host: a `worker_threads` engine-worker factory + an asset
 * `fetch` shim that serves `assetBaseUrl` files from `publicDir`. One active installation
 * is allowed per module instance; a second call throws without changing globals.
 * Dispose all compilers, then the returned handle, before installing another host.
 */
export declare function installNodeWorkerHost(opts: NodeWorkerHostOptions): NodeWorkerHostInstallation;
