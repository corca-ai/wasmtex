import { BaseWorkerEngine as e, resolveTexliveUrl as t } from "./base-worker-engine.js";
import { createEngineWorker as n } from "./worker-host.js";
//#region src/engine/wasmtex-worker.ts
function r(e) {
	let t = e.errorLog ? `\nEngine log:\n${e.errorLog}` : "", n = /* @__PURE__ */ Error(`${e.errorMessage || "Worker error"}${t}`);
	if (e.errorName && (n.name = e.errorName), e.errorStack) {
		let t = e.errorStack.split("\n").slice(1).join("\n");
		n.stack = `${n.name}: ${n.message}${t ? `\n${t}` : ""}`;
	}
	return n;
}
var i = class extends e {
	onFileDownload;
	version;
	constructor(e, t, n) {
		super(e, t), this.version = n;
	}
	async init() {
		this.worker || (this.status = "loading", await new Promise((e, t) => {
			this.worker = n(this.enginePath), this.worker.onmessage = (n) => {
				let i = n.data;
				if (!i.cmd) {
					i.result === "ok" ? (this.status = "ready", e()) : this.failInit(t, /* @__PURE__ */ Error("engine failed to initialize"));
					return;
				}
				if (i.cmd === "downloading" && i.file) {
					this.onFileDownload?.(i.file);
					return;
				}
				if (i.cmd === "workererror") {
					this.failInit(t, r(i));
					return;
				}
				this.deliverResponse(`cmd:${i.cmd}`, i);
			}, this.worker.onerror = (e) => {
				this.failInit(t, e);
			};
		}), this.worker.postMessage({
			cmd: "settexliveurl",
			url: t(this.texliveUrl, this.version)
		}));
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
}, a = class extends i {
	async run(e) {
		if (this.status !== "ready" || !this.worker) return {
			success: !1,
			log: "engine not ready",
			out: null
		};
		this.status = "compiling";
		let t = await this.postMessageWithResponse({ cmd: e }, "cmd:compile");
		this.status = "ready";
		let n = t.result === "ok" && (t.status === 0 || t.status === 1), r = t.pdf ? new Uint8Array(t.pdf) : null;
		return {
			success: n,
			log: t.log || "",
			out: r,
			...t.inputFiles ? { inputFiles: t.inputFiles } : {},
			...typeof t.inputFilesComplete == "boolean" ? { inputFilesComplete: t.inputFilesComplete } : {}
		};
	}
	loadBloom(e) {
		this.worker?.postMessage({
			cmd: "loadbloom",
			data: e
		});
	}
	preloadTexlive(e, t, n) {
		this.worker?.postMessage({
			cmd: "preloadtexlive",
			format: e,
			filename: t,
			data: n
		}, [n]);
	}
	preload404(e) {
		e.length !== 0 && this.worker?.postMessage({
			cmd: "preload404",
			entries: e
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
export { a as CompileWorkerDriver, i as WasmTexWorker };
