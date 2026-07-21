import { existsSync as h, readFileSync as d } from "node:fs";
import { join as f } from "node:path";
import { Worker as u } from "node:worker_threads";
import { setWorkerFactory as m } from "./worker-host.js";
const p = `
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
`, c = !!process.env.WASMTEX_NODE_DEBUG, l = (...t) => {
  c && console.error("[node-host]", ...t);
};
function g(t, n) {
  const a = new u(p, { eval: !0, workerData: { workerPath: t, wasmPath: n } }), r = [];
  let o = null, s = null;
  return a.on("message", (e) => {
    c && l(
      "recv",
      e?.cmd ?? e?.result
    ), o ? o({ data: e }) : r.push(e);
  }), a.on("error", (e) => {
    l("worker error", String(e)), s?.(e);
  }), {
    postMessage(e, i) {
      c && l("send", e?.cmd), a.postMessage(e, i ?? []);
    },
    get onmessage() {
      return o;
    },
    set onmessage(e) {
      if (o = e, e) for (const i of r.splice(0)) e({ data: i });
    },
    get onerror() {
      return s;
    },
    set onerror(e) {
      s = e;
    },
    terminate() {
      a.terminate();
    }
  };
}
function _(t) {
  const n = t.assetBaseUrl.endsWith("/") ? t.assetBaseUrl : `${t.assetBaseUrl}/`, a = t.baseFetch ?? globalThis.fetch;
  globalThis.fetch = (async (r, o) => {
    const s = typeof r == "string" ? r : r instanceof Request ? r.url : r.toString();
    if (s.startsWith(n)) {
      const e = f(t.publicDir, s.slice(n.length).split("?")[0]), i = h(e);
      return l("fetch local", i ? "HIT" : "404", s), i ? new Response(d(e)) : new Response(null, { status: 404 });
    }
    return l("fetch cdn", s), a(r, o);
  }), m((r) => {
    const o = r.startsWith(n) ? r.slice(n.length) : r, s = f(t.publicDir, o), e = s.replace(/\.worker\.js$/, ".wasm");
    return g(s, e);
  });
}
export {
  _ as installNodeWorkerHost
};
