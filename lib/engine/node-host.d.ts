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
/**
 * Install the Node worker host: a `worker_threads` engine-worker factory + an asset
 * `fetch` shim that serves `assetBaseUrl` files from `publicDir`. Call once before
 * constructing any `WasmTexCompiler`.
 */
export declare function installNodeWorkerHost(opts: NodeWorkerHostOptions): void;
