import { buildDependencyGraph as p } from "./dependency-graph.js";
import { BaseTexFmtEngine as u, createCompileWorker as d, unicodeFormatUrl as v } from "./tex-fmt-engine.js";
import { parseXdv as x, attachPlacements as w } from "./xdv.js";
class D extends u {
  dvipdfm;
  constructor(e = {}) {
    const i = e.texliveVersion ?? "2025";
    super(
      d("xetex", e),
      "wasmtex-xetex.fmt",
      v("xetex", e),
      void 0,
      e.persistentCache ? { version: i } : void 0
    ), this.dvipdfm = d("dvipdfm", e);
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
  /** Project files must exist in BOTH workers: XeTeX only records an image
   *  reference in the XDV; dvipdfmx re-opens the actual file (`\includegraphics`,
   *  `pdfpages` imports) from its own FS when embedding. */
  async writeFile(e, i) {
    await Promise.all([super.writeFile(e, i), this.dvipdfm.writeFile(e, i)]);
  }
  async mkdir(e) {
    await super.mkdir(e), this.dvipdfm.mkdir(e);
  }
  async compile() {
    const e = performance.now(), i = await this.ensureFormat(), s = await this.tex.run("compilelatex");
    if (!s.success || !s.out)
      return this.result(!1, null, `${i}
${s.log}`.trim(), e);
    const n = `${this.mainBase}.xdv`;
    await this.dvipdfm.writeFile(n, s.out), this.dvipdfm.setMainFile(n);
    const r = await this.dvipdfm.run("compilepdf"), a = `${s.log}
${r.log}`, t = this.result(r.success && !!r.out, r.out, a, e), { pages: o, placements: c, reliable: l } = x(s.out);
    if (t.telemetry && (t.telemetry.geometry = { pages: o, reliable: l }), t.glyphCoverage && w(t.glyphCoverage.gaps, c, l, a), t.telemetry) {
      const h = [...new Set(o.flatMap((m) => m.textRuns.map((f) => f.font)))].filter(
        (m) => !!m
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
