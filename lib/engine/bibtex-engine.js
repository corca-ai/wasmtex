import { engineWorkerUrl as r } from "./engine-assets.js";
import { WasmTexWorker as i } from "./wasmtex-worker.js";
class n extends i {
  constructor(e) {
    const s = e?.assetBaseUrl ?? "/", t = e?.texliveVersion ?? "2025";
    super(r(s, t, "bibtex"), e?.texliveUrl ?? null, t);
  }
  async compile(e) {
    if (this.status !== "ready" || !this.worker)
      return { success: !1, log: "BibTeX engine not ready" };
    this.status = "compiling";
    const s = await this.postMessageWithResponse(
      { cmd: "compilebibtex", url: e },
      "cmd:compile"
    );
    return this.status = "ready", {
      success: s.result === "ok",
      log: s.log || ""
    };
  }
}
export {
  n as BibtexEngine
};
