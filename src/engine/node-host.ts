/**
 * Node host adapter (#121, execution-model principle 1) — runs the same WASM engines
 * off-browser by installing a `worker_threads`-backed {@link EngineWorker} factory and
 * an asset `fetch` shim. The browser worker controller is reused verbatim: the bootstrap shims
 * the few browser globals it expects (`self`, `postMessage`/`onmessage`, a synchronous
 * `XMLHttpRequest`/`importScripts`) and injects the `.wasm` bytes so Emscripten skips its
 * file lookup.
 *
 * Node-only: imported by the `wasmtex/node` entry, never by the browser/headless core
 * (the headless-boundary guard would otherwise flag the `node:*` imports).
 *
 *   import { installNodeWorkerHost } from 'wasmtex/node'
 *   installNodeWorkerHost({ publicDir: '…/public', assetBaseUrl: 'http://assets.local/' })
 *   const c = new WasmTexCompiler({ engine: 'pdflatex', assetBaseUrl: 'http://assets.local/',
 *                                     texliveUrl: 'https://…cloudfront.net/2025/', files })
 */
import { readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { Worker } from 'node:worker_threads'
import { type EngineWorker, setWorkerFactory } from './worker-host'

export interface NodeWorkerHostOptions {
  /** Local directory holding the engine assets (the project's `public/`). The worker/module JS,
   *  generated module JS and `.wasm` are loaded from here; `.fmt`/bloom fetches under
   *  `assetBaseUrl` are served
   *  from here too. */
  publicDir: string
  /** The `assetBaseUrl` passed to `WasmTexCompiler`. Fetches that start with it are
   *  served from `publicDir`; everything else (the TeX Live CDN) passes through. */
  assetBaseUrl: string
  /** Wrapped fetch (defaults to the global). */
  baseFetch?: typeof fetch
}

/** Resources installed globally by {@link installNodeWorkerHost}. Dispose this only after
 *  all compilers using the host have been disposed. */
export interface NodeWorkerHostInstallation {
  /** Restore the previous global `fetch` and worker factory. Idempotent. */
  dispose(): void
}

// The worker thread program. Reuses the browser controller with host shims + a wasmBinary
// injection. `workerData` carries the resolved local controller and WASM paths.
const BOOTSTRAP = `
const { parentPort, workerData } = require('node:worker_threads')
const { readFileSync, unlinkSync } = require('node:fs')
const { execFileSync } = require('node:child_process')
const { dirname, resolve } = require('node:path')
const { fileURLToPath } = require('node:url')
let __xhrSeq = 0
globalThis.self = globalThis
self.location = { href: 'file://' + workerData.workerPath, origin: 'file://' }
self.postMessage = (m) => parentPort.postMessage(m)
self.addEventListener = (t, fn) => { if (t === 'message') self.onmessage = fn }
parentPort.on('message', (m) => { if (self.onmessage) self.onmessage({ data: m }) })
globalThis.importScripts = (...sources) => {
  for (const source of sources) {
    const path = source.startsWith('file:')
      ? fileURLToPath(source)
      : resolve(dirname(workerData.workerPath), source)
    ;(0, eval)(readFileSync(path, 'utf8'))
  }
}
// Synchronous file resolver for the kpse hook — sync HTTP via curl. The driver's
// format/bloom/warmup preloads cover most files, so this fires for few on-demand ones.
globalThis.XMLHttpRequest = class {
  constructor() { this._headers = {} }
  open(_method, url) { this._url = url }
  setRequestHeader() {}
  set responseType(v) { this._rt = v }
  get responseType() { return this._rt }
  getResponseHeader(name) { return this._headers[String(name).toLowerCase()] || null }
  send() {
    const hf = require('node:path').join(require('node:os').tmpdir(), 'wasmtex-h-' + process.pid + '-' + (++__xhrSeq))
    try {
      // --compressed: send Accept-Encoding and transparently decode Content-Encoding:gzip,
      // matching the browser's XHR. Without it, a gzip-encoded CDN asset (e.g. the ICU data
      // file icudt68l.dat) reaches the engine still gzipped → ICU udata_setCommonData fails
      // ("cannot read font names") and XeLaTeX can't resolve fonts by name.
      const body = execFileSync(
        'curl',
        ['-fsSL', '--compressed', '--retry', '3', '--retry-delay', '1', '-D', hf, this._url],
        { maxBuffer: 512 * 1024 * 1024 },
      )
      this.status = 200
      this.response = this._rt === 'arraybuffer'
        ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
        : body.toString('latin1')
      this.responseText = this._rt === 'arraybuffer' ? undefined : body.toString('latin1')
      try {
        for (const line of readFileSync(hf, 'utf8').split(String.fromCharCode(10))) {
          const t = line.trim(); const i = t.indexOf(':')
          if (i > 0) this._headers[t.slice(0, i).trim().toLowerCase()] = t.slice(i + 1).trim()
        }
      } catch (_h) {}
    } catch (error) {
      // Cloudflare may reset an HTTP/2 stream after sending an error response,
      // in which case curl exits 56 rather than 22. Trust an actual HTTP status
      // captured in the response headers, never the transport exit code alone.
      let httpStatus = null
      try {
        for (const line of readFileSync(hf, 'utf8').split(String.fromCharCode(10))) {
          const match = /^HTTP\\/\\S+ (\\d{3})/.exec(line.trim())
          if (match) httpStatus = Number(match[1])
        }
      } catch (_h) {}
      if (httpStatus !== null && httpStatus >= 400) {
        this.status = httpStatus
        this.response = null
      } else {
        throw error
      }
    } finally {
      try { unlinkSync(hf) } catch (_u) {}
    }
  }
}
self.__wasmtexWasmBinary = readFileSync(workerData.wasmPath)
;(0, eval)(readFileSync(workerData.workerPath, 'utf8'))
`

const DEBUG = !!process.env.WASMTEX_NODE_DEBUG
const dbg = (...a: unknown[]): void => {
  if (DEBUG) console.error('[node-host]', ...a)
}

function makeNodeEngineWorker(workerPath: string, wasmPath: string): EngineWorker {
  const worker = new Worker(BOOTSTRAP, { eval: true, workerData: { workerPath, wasmPath } })
  const earlyMessages: unknown[] = []
  let onmessage: ((ev: { data: unknown }) => void) | null = null
  let onerror: ((err: unknown) => void) | null = null

  worker.on('message', (m) => {
    if (DEBUG)
      dbg(
        'recv',
        (m as { cmd?: string; result?: string })?.cmd ?? (m as { result?: string })?.result,
      )
    if (onmessage) onmessage({ data: m })
    else earlyMessages.push(m)
  })
  worker.on('error', (e) => {
    dbg('worker error', String(e))
    onerror?.(e)
  })

  return {
    postMessage(message, transfer) {
      if (DEBUG) dbg('send', (message as { cmd?: string })?.cmd)
      // worker_threads clones ArrayBuffers by default; pass the driver's transfer list
      // through so big buffers (format/PDF) move instead of copy.
      worker.postMessage(message, (transfer ?? []) as readonly ArrayBuffer[])
    },
    get onmessage() {
      return onmessage
    },
    set onmessage(fn) {
      onmessage = fn
      if (fn) for (const m of earlyMessages.splice(0)) fn({ data: m })
    },
    get onerror() {
      return onerror
    },
    set onerror(fn) {
      onerror = fn
    },
    terminate() {
      void worker.terminate()
    },
  }
}

interface AssetRoute {
  matched: boolean
  localPath: string | null
}

function isWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

/** Map an asset URL to a lexical path below `publicRoot`. URL parsing canonicalizes raw and
 * encoded dot segments before the relative path is extracted; segment decoding then rejects
 * encoded separators, backslashes and NULs so they cannot become filesystem traversal. */
function routeAssetUrl(rawUrl: string, baseUrl: URL, publicRoot: string): AssetRoute {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    return { matched: false, localPath: null }
  }
  if (url.origin !== baseUrl.origin || !url.pathname.startsWith(baseUrl.pathname)) {
    return { matched: false, localPath: null }
  }

  const segments: string[] = []
  for (const encoded of url.pathname.slice(baseUrl.pathname.length).split('/')) {
    let segment: string
    try {
      segment = decodeURIComponent(encoded)
    } catch {
      return { matched: true, localPath: null }
    }
    if (
      segment === '.' ||
      segment === '..' ||
      segment.includes('/') ||
      segment.includes('\\') ||
      segment.includes('\0')
    ) {
      return { matched: true, localPath: null }
    }
    if (segment) segments.push(segment)
  }

  const localPath = resolve(publicRoot, ...segments)
  return { matched: true, localPath: isWithin(publicRoot, localPath) ? localPath : null }
}

function readableAssetPath(localPath: string | null, publicRoot: string): string | null {
  if (!localPath) return null
  try {
    const realPath = realpathSync(localPath)
    return isWithin(publicRoot, realPath) && statSync(realPath).isFile() ? realPath : null
  } catch {
    return null
  }
}

/**
 * Install the Node worker host: a `worker_threads` engine-worker factory + an asset
 * `fetch` shim that serves `assetBaseUrl` files from `publicDir`. Call once before
 * constructing any `WasmTexCompiler`. The returned handle restores both globals when
 * disposed, so tests and multi-tenant Node processes do not retain the adapter forever.
 */
export function installNodeWorkerHost(opts: NodeWorkerHostOptions): NodeWorkerHostInstallation {
  const previousFetch = globalThis.fetch
  const baseFetch = opts.baseFetch ?? previousFetch
  const baseUrl = new URL(
    opts.assetBaseUrl.endsWith('/') ? opts.assetBaseUrl : `${opts.assetBaseUrl}/`,
  )
  baseUrl.search = ''
  baseUrl.hash = ''
  const publicRoot = realpathSync(opts.publicDir)

  // Serve the engine assets (.js/.wasm/.fmt[.gz]/bloom) from disk; the CDN passes through.
  const assetFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // A Request stringifies to '[object Request]', not its URL — resolve it via
    // `.url` so asset routing works for every documented fetch input type.
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
    const route = routeAssetUrl(url, baseUrl, publicRoot)
    if (route.matched) {
      const local = readableAssetPath(route.localPath, publicRoot)
      const hit = local !== null
      dbg('fetch local', hit ? 'HIT' : '404', url)
      if (hit) return new Response(readFileSync(local) as unknown as BodyInit)
      return new Response(null, { status: 404 })
    }
    dbg('fetch cdn', url)
    return baseFetch(input, init)
  }) as typeof fetch
  globalThis.fetch = assetFetch

  const restoreWorkerFactory = setWorkerFactory((enginePath: string) => {
    // enginePath is `${assetBaseUrl}wasmtex/<ver>/wasmtex-<engine>.worker.js`.
    const route = routeAssetUrl(enginePath, baseUrl, publicRoot)
    const workerPath = route.matched ? readableAssetPath(route.localPath, publicRoot) : null
    if (!workerPath) throw new Error(`worker asset is outside publicDir or missing: ${enginePath}`)
    const wasmPath = readableAssetPath(workerPath.replace(/\.worker\.js$/, '.wasm'), publicRoot)
    if (!wasmPath) throw new Error(`WASM asset is outside publicDir or missing: ${enginePath}`)
    return makeNodeEngineWorker(workerPath, wasmPath)
  })

  let disposed = false
  return {
    dispose() {
      if (disposed) return
      disposed = true
      if (globalThis.fetch === assetFetch) globalThis.fetch = previousFetch
      restoreWorkerFactory()
    },
  }
}
