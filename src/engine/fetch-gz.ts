/**
 * Shared gzip-first fetch utility used by both the warmup module and
 * the WasmTex engine for pre-loading TeX Live files.
 */

/** Collect all chunks from a ReadableStream into a single ArrayBuffer. */
export async function readStreamToBuffer(stream: ReadableStream<Uint8Array>): Promise<ArrayBuffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  const total = chunks.reduce((s, c) => s + c.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    result.set(c, offset)
    offset += c.length
  }
  return result.buffer
}

/**
 * Read a Response body to bytes, invoking `onProgress` (0→100, clamped) per chunk
 * when a handler is given and a numeric Content-Length is known; otherwise a single
 * `arrayBuffer()` read with no progress. Shared by the pdfTeX and Unicode engines so
 * format-download progress reporting has one implementation.
 */
export async function readResponseWithProgress(
  resp: Response,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array> {
  const contentLength = Number.parseInt(resp.headers.get('Content-Length') || '0', 10)
  if (!onProgress || !resp.body || !contentLength) {
    return new Uint8Array(await resp.arrayBuffer())
  }
  const reader = resp.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loaded += value.length
    // Clamp: a transparently gzip-decoded body can exceed the compressed
    // Content-Length, which would otherwise report >100%.
    onProgress(Math.min(100, Math.round((loaded / contentLength) * 100)))
  }
  const result = new Uint8Array(loaded)
  let offset = 0
  for (const c of chunks) {
    result.set(c, offset)
    offset += c.length
  }
  return result
}

/**
 * Fetch a URL, trying `.gz` compressed version first (with DecompressionStream),
 * falling back to the raw URL. Returns null if both fail.
 */
export async function fetchGzWithFallback(
  url: string,
  opts?: RequestInit,
): Promise<ArrayBuffer | null> {
  if (typeof DecompressionStream !== 'undefined') {
    try {
      const resp = await fetch(`${url}.gz`, opts)
      if (resp.ok) {
        const ds = new DecompressionStream('gzip')
        return await readStreamToBuffer(resp.body!.pipeThrough(ds))
      }
    } catch {
      // .gz fetch or decompress failed — try raw
    }
  }

  try {
    const resp = await fetch(url, opts)
    if (!resp.ok) return null
    return await resp.arrayBuffer()
  } catch {
    return null
  }
}
