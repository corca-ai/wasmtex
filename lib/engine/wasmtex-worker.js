import { BaseWorkerEngine as e, resolveTexliveUrl as t } from "./base-worker-engine.js";
import { ResolverEvidenceCollector as n } from "./resolver-evidence.js";
import { createEngineWorker as r } from "./worker-host.js";
//#region src/engine/wasmtex-worker.ts
function i(e) {
	let t = e.errorLog ? `\nEngine log:\n${e.errorLog}` : "", n = /* @__PURE__ */ Error(`${e.errorMessage || "Worker error"}${t}`);
	if (e.errorName && (n.name = e.errorName), e.errorStack) {
		let t = e.errorStack.split("\n").slice(1).join("\n");
		n.stack = `${n.name}: ${n.message}${t ? `\n${t}` : ""}`;
	}
	return n;
}
var a = class extends e {
	onFileDownload;
	version;
	constructor(e, t, n) {
		super(e, t), this.version = n;
	}
	async init() {
		this.worker || (this.status = "loading", await new Promise((e, t) => {
			this.worker = r(this.enginePath), this.worker.onmessage = (n) => {
				let r = n.data;
				if (!r.cmd) {
					r.result === "ok" ? (this.status = "ready", e()) : this.failInit(t, /* @__PURE__ */ Error("engine failed to initialize"));
					return;
				}
				if (!this.handleProtocolMessage(r)) {
					if (r.cmd === "downloading" && r.file) {
						this.onFileDownload?.(r.file);
						return;
					}
					if (r.cmd === "workererror") {
						this.failInit(t, i(r));
						return;
					}
					this.deliverResponse(`cmd:${r.cmd}`, r);
				}
			}, this.worker.onerror = (e) => {
				this.failInit(t, e);
			};
		}), this.worker.postMessage({
			cmd: "settexliveurl",
			url: t(this.texliveUrl, this.version)
		}));
	}
	handleProtocolMessage(e) {
		return !1;
	}
	failInit(e, t) {
		this.worker?.terminate(), this.worker = null, e(this.handleWorkerError(t));
	}
	async writeFile(e, t) {
		this.worker && await this.postMessageWithResponse({
			cmd: "writefile",
			url: e,
			src: t
		}, "cmd:writefile");
	}
	mkdir(e) {
		this.worker?.postMessage({
			cmd: "mkdir",
			url: e
		});
	}
	setMainFile(e) {
		this.worker?.postMessage({
			cmd: "setmainfile",
			url: e
		});
	}
	async readFile(e) {
		if (!this.worker) return null;
		let t = await this.postMessageWithResponse({
			cmd: "readfile",
			url: e
		}, "cmd:readfile");
		return t.result === "ok" ? t.data ?? null : null;
	}
	flushCache() {
		this.worker?.postMessage({ cmd: "flushcache" });
	}
	isReady() {
		return this.status === "ready";
	}
}, o = class extends a {
	resolver;
	constructor(e, t, r, i = "pdftex", a = {
		id: `texlive-${r}`,
		texliveYear: r,
		mirrorRevision: null
	}) {
		super(e, t, r), this.resolver = new n(i, a);
	}
	handleProtocolMessage(e) {
		return e.cmd === "resolverready" ? (this.resolver.markSupported(), !0) : e.cmd === "resolver" && e.evidence ? (this.resolver.record(e.evidence), !0) : !1;
	}
	async run(e) {
		if (this.status !== "ready" || !this.worker) return {
			success: !1,
			log: "engine not ready",
			out: null
		};
		this.status = "compiling", this.resolver.begin();
		let t = await this.postMessageWithResponse({ cmd: e }, "cmd:compile"), n = this.resolver.finish();
		this.status = "ready";
		let r = t.result === "ok" && (t.status === 0 || t.status === 1), i = t.pdf ? new Uint8Array(t.pdf) : null;
		return {
			success: r,
			log: t.log || "",
			out: i,
			...t.inputFiles ? { inputFiles: t.inputFiles } : {},
			...typeof t.inputFilesComplete == "boolean" ? { inputFilesComplete: t.inputFilesComplete } : {},
			...n ? { resolver: n } : {}
		};
	}
	loadBloom(e) {
		this.worker?.postMessage({
			cmd: "loadbloom",
			data: e
		});
	}
	preloadTexlive(e, t, n, r) {
		this.worker?.postMessage({
			cmd: "preloadtexlive",
			format: e,
			filename: t,
			data: n,
			source: r
		}, [n]);
	}
	preload404(e, t) {
		e.length !== 0 && this.worker?.postMessage({
			cmd: "preload404",
			entries: e,
			source: t
		});
	}
	async dumpCache() {
		if (!this.worker) return {
			files: [],
			notFound: []
		};
		let e = await this.postMessageWithResponse({ cmd: "dumpcache" }, "cmd:dumpcache");
		return {
			files: e.files ?? [],
			notFound: e.notFound ?? []
		};
	}
};
//#endregion
export { o as CompileWorkerDriver, a as WasmTexWorker };
