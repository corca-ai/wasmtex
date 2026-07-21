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
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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
      const body = execFileSync('curl', ['-fsSL', '--compressed', '-D', hf, this._url], { maxBuffer: 512 * 1024 * 1024 })
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
    } catch (_e) {
      this.status = 404
      this.response = null
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

/**
 * Install the Node worker host: a `worker_threads` engine-worker factory + an asset
 * `fetch` shim that serves `assetBaseUrl` files from `publicDir`. Call once before
 * constructing any `WasmTexCompiler`.
 */
export function installNodeWorkerHost(opts: NodeWorkerHostOptions): void {
  const base = opts.assetBaseUrl.endsWith('/') ? opts.assetBaseUrl : `${opts.assetBaseUrl}/`
  const realFetch = opts.baseFetch ?? globalThis.fetch

  // Serve the engine assets (.js/.wasm/.fmt[.gz]/bloom) from disk; the CDN passes through.
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    // A Request stringifies to '[object Request]', not its URL — resolve it via
    // `.url` so asset routing works for every documented fetch input type.
    const url =
      typeof input === 'string' ? input : input instanceof Request ? input.url : input.toString()
    if (url.startsWith(base)) {
      const local = join(opts.publicDir, url.slice(base.length).split('?')[0] as string)
      const hit = existsSync(local)
      dbg('fetch local', hit ? 'HIT' : '404', url)
      if (hit) return new Response(readFileSync(local) as unknown as BodyInit)
      return new Response(null, { status: 404 })
    }
    dbg('fetch cdn', url)
    return realFetch(input, init)
  }) as typeof fetch

  setWorkerFactory((enginePath: string) => {
    // enginePath is `${assetBaseUrl}wasmtex/<ver>/wasmtex-<engine>.worker.js`.
    const rel = enginePath.startsWith(base) ? enginePath.slice(base.length) : enginePath
    const workerPath = join(opts.publicDir, rel)
    const wasmPath = workerPath.replace(/\.worker\.js$/, '.wasm')
    return makeNodeEngineWorker(workerPath, wasmPath)
  })
}
