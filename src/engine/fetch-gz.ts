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
 * when a numeric Content-Length is known. Byte progress does not require a
 * Content-Length and remains meaningful for transparently decoded responses.
 * Shared by the pdfTeX and Unicode engines.
 */
export async function readResponseWithProgress(
  resp: Response,
  onProgress?: (pct: number) => void,
  onBytes?: (received: number) => void,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  signal?.throwIfAborted()
  const contentLength = Number.parseInt(resp.headers.get('Content-Length') || '0', 10)
  if (!resp.body) {
    const bytes = new Uint8Array(await resp.arrayBuffer())
    if (bytes.length) onBytes?.(bytes.length)
    return bytes
  }
  const reader = resp.body.getReader()
  const abort = () => {
    void reader.cancel(signal?.reason).catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })
  const chunks: Uint8Array[] = []
  let loaded = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      if (!value.length) continue
      chunks.push(value)
      loaded += value.length
      onBytes?.(loaded)
      // HTTP-decoded bytes can exceed the compressed Content-Length.
      if (Number.isFinite(contentLength) && contentLength > 0) {
        onProgress?.(Math.min(100, Math.round((loaded / contentLength) * 100)))
      }
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
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
