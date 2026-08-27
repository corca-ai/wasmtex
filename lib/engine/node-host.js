import { setWorkerFactory as e } from "./worker-host.js";
import { readFileSync as t, realpathSync as n, statSync as r } from "node:fs";
import { isAbsolute as i, relative as a, resolve as o, sep as s } from "node:path";
import { Worker as c } from "node:worker_threads";
//#region src/engine/node-host.ts
var l = "\nconst { parentPort, workerData } = require('node:worker_threads')\nconst { readFileSync, unlinkSync } = require('node:fs')\nconst { execFileSync } = require('node:child_process')\nconst { dirname, resolve } = require('node:path')\nconst { fileURLToPath } = require('node:url')\nlet __xhrSeq = 0\nglobalThis.self = globalThis\nself.location = { href: 'file://' + workerData.workerPath, origin: 'file://' }\nself.postMessage = (m) => parentPort.postMessage(m)\nself.addEventListener = (t, fn) => { if (t === 'message') self.onmessage = fn }\nparentPort.on('message', (m) => { if (self.onmessage) self.onmessage({ data: m }) })\nglobalThis.importScripts = (...sources) => {\n  for (const source of sources) {\n    const path = source.startsWith('file:')\n      ? fileURLToPath(source)\n      : resolve(dirname(workerData.workerPath), source)\n    ;(0, eval)(readFileSync(path, 'utf8'))\n  }\n}\n// Synchronous file resolver for the kpse hook — sync HTTP via curl. The driver's\n// format/bloom/warmup preloads cover most files, so this fires for few on-demand ones.\nglobalThis.XMLHttpRequest = class {\n  constructor() { this._headers = {} }\n  open(_method, url) { this._url = url }\n  setRequestHeader() {}\n  set responseType(v) { this._rt = v }\n  get responseType() { return this._rt }\n  getResponseHeader(name) { return this._headers[String(name).toLowerCase()] || null }\n  send() {\n    const hf = require('node:path').join(require('node:os').tmpdir(), 'wasmtex-h-' + process.pid + '-' + (++__xhrSeq))\n    try {\n      // --compressed: send Accept-Encoding and transparently decode Content-Encoding:gzip,\n      // matching the browser's XHR. Without it, a gzip-encoded CDN asset (e.g. the ICU data\n      // file icudt68l.dat) reaches the engine still gzipped → ICU udata_setCommonData fails\n      // (\"cannot read font names\") and XeLaTeX can't resolve fonts by name.\n      const body = execFileSync(\n        'curl',\n        ['-fsSL', '--compressed', '--retry', '3', '--retry-delay', '1', '-D', hf, this._url],\n        { maxBuffer: 512 * 1024 * 1024 },\n      )\n      this.status = 200\n      this.response = this._rt === 'arraybuffer'\n        ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)\n        : body.toString('latin1')\n      this.responseText = this._rt === 'arraybuffer' ? undefined : body.toString('latin1')\n      try {\n        for (const line of readFileSync(hf, 'utf8').split(String.fromCharCode(10))) {\n          const t = line.trim(); const i = t.indexOf(':')\n          if (i > 0) this._headers[t.slice(0, i).trim().toLowerCase()] = t.slice(i + 1).trim()\n        }\n      } catch (_h) {}\n    } catch (error) {\n      // Cloudflare may reset an HTTP/2 stream after sending an error response,\n      // in which case curl exits 56 rather than 22. Trust an actual HTTP status\n      // captured in the response headers, never the transport exit code alone.\n      let httpStatus = null\n      try {\n        for (const line of readFileSync(hf, 'utf8').split(String.fromCharCode(10))) {\n          const match = /^HTTP\\/\\S+ (\\d{3})/.exec(line.trim())\n          if (match) httpStatus = Number(match[1])\n        }\n      } catch (_h) {}\n      if (httpStatus !== null && httpStatus >= 400) {\n        this.status = httpStatus\n        this.response = null\n      } else {\n        throw error\n      }\n    } finally {\n      try { unlinkSync(hf) } catch (_u) {}\n    }\n  }\n}\nself.__wasmtexWasmBinary = readFileSync(workerData.wasmPath)\n;(0, eval)(readFileSync(workerData.workerPath, 'utf8'))\n", u = !!process.env.WASMTEX_NODE_DEBUG, d = (...e) => {
	u && console.error("[node-host]", ...e);
};
function f(e, t) {
	let n = new c(l, {
		eval: !0,
		workerData: {
			workerPath: e,
			wasmPath: t
		}
	}), r = [], i = null, a = null;
	return n.on("message", (e) => {
		u && d("recv", e?.cmd ?? e?.result), i ? i({ data: e }) : r.push(e);
	}), n.on("error", (e) => {
		d("worker error", String(e)), a?.(e);
	}), {
		postMessage(e, t) {
			u && d("send", e?.cmd), n.postMessage(e, t ?? []);
		},
		get onmessage() {
			return i;
		},
		set onmessage(e) {
			if (i = e, e) for (let t of r.splice(0)) e({ data: t });
		},
		get onerror() {
			return a;
		},
		set onerror(e) {
			a = e;
		},
		terminate() {
			n.terminate();
		}
	};
}
function p(e, t) {
	let n = a(e, t);
	return n === "" || n !== ".." && !n.startsWith(`..${s}`) && !i(n);
}
function m(e, t, n) {
	let r;
	try {
		r = new URL(e);
	} catch {
		return {
			matched: !1,
			localPath: null
		};
	}
	if (r.origin !== t.origin || !r.pathname.startsWith(t.pathname)) return {
		matched: !1,
		localPath: null
	};
	let i = [];
	for (let e of r.pathname.slice(t.pathname.length).split("/")) {
		let t;
		try {
			t = decodeURIComponent(e);
		} catch {
			return {
				matched: !0,
				localPath: null
			};
		}
		if (t === "." || t === ".." || t.includes("/") || t.includes("\\") || t.includes("\0")) return {
			matched: !0,
			localPath: null
		};
		t && i.push(t);
	}
	let a = o(n, ...i);
	return {
		matched: !0,
		localPath: p(n, a) ? a : null
	};
}
function h(e, t) {
	if (!e) return null;
	try {
		let i = n(e);
		return p(t, i) && r(i).isFile() ? i : null;
	} catch {
		return null;
	}
}
function g(r) {
	let i = globalThis.fetch, a = r.baseFetch ?? i, o = new URL(r.assetBaseUrl.endsWith("/") ? r.assetBaseUrl : `${r.assetBaseUrl}/`);
	o.search = "", o.hash = "";
	let s = n(r.publicDir), c = (async (e, n) => {
		let r = typeof e == "string" ? e : e instanceof Request ? e.url : e.toString(), i = m(r, o, s);
		if (i.matched) {
			let e = h(i.localPath, s), n = e !== null;
			return d("fetch local", n ? "HIT" : "404", r), n ? new Response(t(e)) : new Response(null, { status: 404 });
		}
		return d("fetch cdn", r), a(e, n);
	});
	globalThis.fetch = c;
	let l = e((e) => {
		let t = m(e, o, s), n = t.matched ? h(t.localPath, s) : null;
		if (!n) throw Error(`worker asset is outside publicDir or missing: ${e}`);
		let r = h(n.replace(/\.worker\.js$/, ".wasm"), s);
		if (!r) throw Error(`WASM asset is outside publicDir or missing: ${e}`);
		return f(n, r);
	}), u = !1;
	return { dispose() {
		u || (u = !0, globalThis.fetch === c && (globalThis.fetch = i), l());
	} };
}
//#endregion
export { g as installNodeWorkerHost };
