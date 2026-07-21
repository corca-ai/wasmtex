import { resolveTexliveUrl as i } from "./base-worker-engine.js";
import { LUATEX_KNOWN_404 as o, LUATEX_PRELOAD as l } from "./luatex-manifest.js";
import { BaseTexFmtEngine as n, createCompileWorker as c, unicodeFormatUrl as m } from "./tex-fmt-engine.js";
class p extends n {
  constructor(e = {}) {
    const t = e.texliveVersion ?? "2025";
    super(
      c("luatex", e),
      "wasmtex-luatex.fmt",
      m("luatex", e),
      {
        texliveUrl: i(e.texliveUrl ?? null, t),
        preload: l,
        notFound: o
      },
      e.persistentCache ? { version: t } : void 0
    );
  }
  async init() {
    await this.initTex();
  }
  async compile() {
    const e = performance.now(), t = await this.ensureFormat(), s = await this.tex.run("compilelatex"), a = `${t}
${s.log}`.trim(), r = this.result(s.success && !!s.out, s.out, a, e);
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
  p as WasmTexLuatexEngine
};
