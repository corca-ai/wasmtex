import { buildDependencyGraph as p } from "./dependency-graph.js";
import { BaseTexFmtEngine as u, createCompileWorker as c, unicodeFormatUrl as x } from "./tex-fmt-engine.js";
import { parseXdv as v, attachPlacements as g } from "./xdv.js";
class D extends u {
  dvipdfm;
  constructor(e = {}) {
    const r = e.texliveVersion ?? "2025";
    super(
      c("xetex", e),
      "wasmtex-xetex.fmt",
      x("xetex", e),
      void 0,
      e.persistentCache ? { version: r } : void 0
    ), this.dvipdfm = c("dvipdfm", e);
  }
  async init() {
    this.dvipdfm.onFileDownload = (e) => {
      this.bumpDownloadCount(), this.onFileDownload?.(e);
    }, await Promise.all([this.initTex(), this.dvipdfm.init()]), this.rehydrateExtraDriver(this.dvipdfm);
  }
  /** dvipdfmx fetches+embeds fonts the primary XeTeX worker never caches — persist them too. */
  extraCacheDrivers() {
    return [this.dvipdfm];
  }
  async compile() {
    const e = performance.now(), r = await this.ensureFormat(), i = await this.tex.run("compilelatex");
    if (!i.success || !i.out)
      return this.result(!1, null, `${r}
${i.log}`.trim(), e);
    const o = `${this.mainBase}.xdv`;
    await this.dvipdfm.writeFile(o, i.out), this.dvipdfm.setMainFile(o);
    const s = await this.dvipdfm.run("compilepdf"), a = `${i.log}
${s.log}`, t = this.result(s.success && !!s.out, s.out, a, e), { pages: m, placements: d, reliable: l } = v(i.out);
    if (t.telemetry && (t.telemetry.geometry = { pages: m, reliable: l }), t.glyphCoverage && g(t.glyphCoverage.gaps, d, l, a), t.telemetry) {
      const h = [...new Set(m.flatMap((n) => n.textRuns.map((f) => f.font)))].filter(
        (n) => !!n
      );
      t.telemetry.dependencies = p(a, {
        fonts: h,
        source: this.mainSource()
      });
    }
    return t.success && this.maybePersist(), t;
  }
  async flushCache() {
    this.tex.flushCache(), this.dvipdfm.flushCache(), this.clearInjectedFormat();
  }
  terminate() {
    this.tex.terminate(), this.dvipdfm.terminate();
  }
}
export {
  D as WasmTexXetexEngine
};
