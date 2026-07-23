import { buildDependencyGraph as u } from "./dependency-graph.js";
import { BaseTexFmtEngine as f, createCompileWorker as d, unicodeFormatUrl as v } from "./tex-fmt-engine.js";
import { parseXdv as x, attachPlacements as w } from "./xdv.js";
class D extends f {
  dvipdfm;
  constructor(e = {}) {
    const s = e.texliveVersion ?? "2025";
    super(
      d("xetex", e),
      "wasmtex-xetex.fmt",
      v("xetex", e),
      void 0,
      e.persistentCache ? { version: s } : void 0
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
  async writeFile(e, s) {
    await Promise.all([super.writeFile(e, s), this.dvipdfm.writeFile(e, s)]);
  }
  async mkdir(e) {
    await super.mkdir(e), this.dvipdfm.mkdir(e);
  }
  async compile() {
    const e = performance.now(), s = await this.ensureFormat(), t = await this.tex.run("compilelatex");
    if (!t.success || !t.out)
      return this.result(
        !1,
        null,
        `${s}
${t.log}`.trim(),
        e,
        t.inputFiles,
        !1
      );
    const l = `${this.mainBase}.xdv`;
    await this.dvipdfm.writeFile(l, t.out), this.dvipdfm.setMainFile(l);
    const r = await this.dvipdfm.run("compilepdf"), a = `${t.log}
${r.log}`, i = this.result(
      r.success && !!r.out,
      r.out,
      a,
      e,
      t.inputFiles,
      t.inputFilesComplete
    ), { pages: m, placements: c, reliable: o } = x(t.out);
    if (i.telemetry && (i.telemetry.geometry = { pages: m, reliable: o }), i.glyphCoverage && w(i.glyphCoverage.gaps, c, o, a), i.telemetry) {
      const p = [...new Set(m.flatMap((n) => n.textRuns.map((h) => h.font)))].filter(
        (n) => !!n
      );
      i.telemetry.dependencies = u(a, {
        inputFiles: t.inputFiles,
        fonts: p,
        source: this.mainSource()
      });
    }
    return i.success && this.maybePersist(), i;
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
