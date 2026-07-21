import { engineWorkerUrl as i } from "./engine-assets.js";
import { WasmTexWorker as r } from "./wasmtex-worker.js";
class l extends r {
  constructor(e) {
    const s = e?.assetBaseUrl ?? "/", t = e?.texliveVersion ?? "2025";
    super(i(s, t, "makeindex"), e?.texliveUrl ?? null, t);
  }
  /** Process `<idxBaseName>.idx` → `<idxBaseName>.ind` (+ `.ilg` log). The worker reads the
   *  `.idx` from its MEMFS (write it first) and replies under the shared `cmd:compile` key. */
  async compile(e) {
    if (this.status !== "ready" || !this.worker)
      return { success: !1, log: "makeindex engine not ready" };
    await this.writeFile("makeindex", ""), this.status = "compiling";
    const s = await this.postMessageWithResponse(
      { cmd: "compilemakeindex", url: e },
      "cmd:compile"
    );
    return this.status = "ready", {
      success: s.result === "ok",
      log: s.log || ""
    };
  }
}
export {
  l as MakeindexEngine
};
