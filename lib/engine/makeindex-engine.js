import { engineWorkerUrl as e } from "./engine-assets.js";
import { WasmTexWorker as t } from "./wasmtex-worker.js";
//#region src/engine/makeindex-engine.ts
var n = class extends t {
	constructor(t) {
		let n = t?.assetBaseUrl ?? "/", r = t?.texliveVersion ?? "2025";
		super(e(n, r, "makeindex"), t?.texliveUrl ?? null, r);
	}
	async compile(e, t) {
		if (this.status !== "ready" || !this.worker) return {
			success: !1,
			log: "makeindex engine not ready"
		};
		await this.writeFile("makeindex", ""), this.status = "compiling";
		let n = await this.postMessageWithResponse({
			cmd: "compilemakeindex",
			url: e,
			job: t
		}, "cmd:compile");
		return this.status = "ready", {
			success: n.result === "ok",
			log: n.log || ""
		};
	}
};
//#endregion
export { n as MakeindexEngine };
