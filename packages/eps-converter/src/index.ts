/** An EPS conversion job. The host must terminate its worker to interrupt WASM. */
export interface EpsConversionRequest {
  readonly bytes: Uint8Array
  readonly signal: AbortSignal
}

export interface EpsConverter {
  /** Returns one cropped PDF page, or rejects without returning partial output. */
  convert(request: EpsConversionRequest): Promise<Uint8Array<ArrayBuffer>>
  /** Current WASM linear-memory capacity; excludes host JS allocations. */
  readonly memoryBytes: number
}

interface StetModule {
  default(options?: { module_or_path: WebAssembly.Module }): Promise<{
    memory: WebAssembly.Memory
  }>
  convert_eps(bytes: Uint8Array): Uint8Array<ArrayBuffer>
}

/**
 * Load the optional runtime inside a host-owned worker. No worker, queue, cache,
 * asset host or timeout policy is installed. Serve stet.js and stet_bg.wasm
 * together, with the package's notices. `wasm` supports precompiled local hosts.
 */
export async function loadEpsConverter(
  moduleUrl: string,
  wasm?: WebAssembly.Module,
): Promise<EpsConverter> {
  const runtime: StetModule = await import(/* @vite-ignore */ moduleUrl)
  const { memory } = await runtime.default(wasm ? { module_or_path: wasm } : undefined)
  return {
    get memoryBytes() {
      return memory.buffer.byteLength
    },
    async convert({ bytes, signal }) {
      signal.throwIfAborted()
      if (!bytes.byteLength || bytes.byteLength > 16 * 1024 * 1024)
        throw new Error('EPS input must be nonempty and at most 16 MiB.')
      const pdf = runtime.convert_eps(bytes)
      signal.throwIfAborted()
      return pdf
    },
  }
}
