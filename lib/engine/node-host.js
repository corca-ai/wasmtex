import { realpathSync as w, readFileSync as S, statSync as k } from "node:fs";
import { resolve as _, relative as T, sep as P, isAbsolute as v } from "node:path";
import { Worker as D } from "node:worker_threads";
import { setWorkerFactory as F } from "./worker-host.js";
const W = `
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
`, m = !!process.env.WASMTEX_NODE_DEBUG, u = (...r) => {
  m && console.error("[node-host]", ...r);
};
function R(r, n) {
  const t = new D(W, { eval: !0, workerData: { workerPath: r, wasmPath: n } }), a = [];
  let o = null, l = null;
  return t.on("message", (e) => {
    m && u(
      "recv",
      e?.cmd ?? e?.result
    ), o ? o({ data: e }) : a.push(e);
  }), t.on("error", (e) => {
    u("worker error", String(e)), l?.(e);
  }), {
    postMessage(e, s) {
      m && u("send", e?.cmd), t.postMessage(e, s ?? []);
    },
    get onmessage() {
      return o;
    },
    set onmessage(e) {
      if (o = e, e) for (const s of a.splice(0)) e({ data: s });
    },
    get onerror() {
      return l;
    },
    set onerror(e) {
      l = e;
    },
    terminate() {
      t.terminate();
    }
  };
}
function b(r, n) {
  const t = T(r, n);
  return t === "" || t !== ".." && !t.startsWith(`..${P}`) && !v(t);
}
function y(r, n, t) {
  let a;
  try {
    a = new URL(r);
  } catch {
    return { matched: !1, localPath: null };
  }
  if (a.origin !== n.origin || !a.pathname.startsWith(n.pathname))
    return { matched: !1, localPath: null };
  const o = [];
  for (const e of a.pathname.slice(n.pathname.length).split("/")) {
    let s;
    try {
      s = decodeURIComponent(e);
    } catch {
      return { matched: !0, localPath: null };
    }
    if (s === "." || s === ".." || s.includes("/") || s.includes("\\") || s.includes("\0"))
      return { matched: !0, localPath: null };
    s && o.push(s);
  }
  const l = _(t, ...o);
  return { matched: !0, localPath: b(t, l) ? l : null };
}
function d(r, n) {
  if (!r) return null;
  try {
    const t = w(r);
    return b(n, t) && k(t).isFile() ? t : null;
  } catch {
    return null;
  }
}
function C(r) {
  const n = globalThis.fetch, t = r.baseFetch ?? n, a = new URL(
    r.assetBaseUrl.endsWith("/") ? r.assetBaseUrl : `${r.assetBaseUrl}/`
  );
  a.search = "", a.hash = "";
  const o = w(r.publicDir), l = (async (i, f) => {
    const c = typeof i == "string" ? i : i instanceof Request ? i.url : i.toString(), h = y(c, a, o);
    if (h.matched) {
      const p = d(h.localPath, o), g = p !== null;
      return u("fetch local", g ? "HIT" : "404", c), g ? new Response(S(p)) : new Response(null, { status: 404 });
    }
    return u("fetch cdn", c), t(i, f);
  });
  globalThis.fetch = l;
  const e = F((i) => {
    const f = y(i, a, o), c = f.matched ? d(f.localPath, o) : null;
    if (!c) throw new Error(`worker asset is outside publicDir or missing: ${i}`);
    const h = d(c.replace(/\.worker\.js$/, ".wasm"), o);
    if (!h) throw new Error(`WASM asset is outside publicDir or missing: ${i}`);
    return R(c, h);
  });
  let s = !1;
  return {
    dispose() {
      s || (s = !0, globalThis.fetch === l && (globalThis.fetch = n), e());
    }
  };
}
export {
  C as installNodeWorkerHost
};
