import { resolveTexliveUrl as a } from "./base-worker-engine.js";
import { LUATEX_KNOWN_404 as l, LUATEX_PRELOAD as n } from "./luatex-manifest.js";
import { BaseTexFmtEngine as o, createCompileWorker as c, unicodeFormatUrl as m } from "./tex-fmt-engine.js";
class f extends o {
  constructor(e = {}) {
    const s = e.texliveVersion ?? "2025";
    super(
      c("luatex", e),
      "wasmtex-luatex.fmt",
      m("luatex", e),
      {
        texliveUrl: a(e.texliveUrl ?? null, s),
        preload: n,
        notFound: l
      },
      e.persistentCache ? { version: s } : void 0
    );
  }
  async init() {
    await this.initTex();
  }
  async compile() {
    const e = performance.now(), s = await this.ensureFormat(), t = await this.tex.run("compilelatex"), i = `${s}
${t.log}`.trim(), r = this.result(
      t.success && !!t.out,
      t.out,
      i,
      e,
      t.inputFiles,
      t.inputFilesComplete
    );
    return r.success && this.maybePersist(), r;
  }
  async flushCache() {
    this.tex.flushCache(), this.clearInjectedFormat();
  }
  terminate() {
    this.tex.terminate();
  }
}
export {
  f as WasmTexLuatexEngine
};
