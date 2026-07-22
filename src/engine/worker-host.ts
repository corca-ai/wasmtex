/**
 * Host-port seam for engine workers (S2 / #109, execution-model principle 1).
 *
 * The WASM engines run inside a worker. *Which kind* of worker is a host concern, not
 * an engine concern: a browser provides a Web Worker; a non-browser host (Node
 * `worker_threads`, Deno, …) provides its own. The engine drivers create their worker
 * through {@link createEngineWorker} instead of `new Worker(...)` directly, so the same
 * engine code runs on any host. The browser path is the default and is unchanged.
 *
 * A non-browser adapter calls {@link setWorkerFactory} once at startup with a factory
 * that returns an {@link EngineWorker} (e.g. wrapping a `worker_threads.Worker` and
 * shimming the browser globals the engine glue expects). See `docs/execution-model.md`.
 */

/** The minimal Worker contract the engine drivers use — a structural subset of the DOM
 *  `Worker`, so a browser `Worker` satisfies it as-is. */
export interface EngineWorker {
  postMessage(message: unknown, transfer?: Transferable[]): void
  onmessage: ((ev: { data: unknown }) => void) | null
  onerror: ((err: unknown) => void) | null
  terminate(): void
}

/** Creates an {@link EngineWorker} that loads the engine glue at `enginePath`. */
export type WorkerFactory = (enginePath: string) => EngineWorker

// Default: a browser Web Worker. Referenced lazily (inside the factory), so importing
// this module on a host without a global `Worker` is fine as long as the host installs
// its own factory via setWorkerFactory() before creating any engine.
let factory: WorkerFactory = (enginePath) => new Worker(enginePath) as unknown as EngineWorker

/** Install a host-specific worker factory (e.g. Node `worker_threads`). Call before
 *  constructing an engine. Returns an idempotent cleanup that restores the previous
 *  factory, unless another host has replaced this one in the meantime. */
export function setWorkerFactory(next: WorkerFactory): () => void {
  const previous = factory
  factory = next
  return () => {
    if (factory === next) factory = previous
  }
}

/** Create an engine worker via the installed factory (browser Web Worker by default). */
export function createEngineWorker(enginePath: string): EngineWorker {
  return factory(enginePath)
}
