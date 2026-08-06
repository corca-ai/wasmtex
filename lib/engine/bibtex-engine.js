import { engineWorkerUrl as e } from "./engine-assets.js";
import { WasmTexWorker as t } from "./wasmtex-worker.js";
//#region src/engine/bibtex-engine.ts
var n = class extends t {
	constructor(t) {
		let n = t?.assetBaseUrl ?? "/", r = t?.texliveVersion ?? "2025";
		super(e(n, r, "bibtex"), t?.texliveUrl ?? null, r);
	}
	async compile(e) {
		if (this.status !== "ready" || !this.worker) return {
			success: !1,
			log: "BibTeX engine not ready"
		};
		this.status = "compiling";
		let t = await this.postMessageWithResponse({
			cmd: "compilebibtex",
			url: e
		}, "cmd:compile");
		return this.status = "ready", {
			success: t.result === "ok",
			log: t.log || ""
		};
	}
};
//#endregion
export { n as BibtexEngine };
