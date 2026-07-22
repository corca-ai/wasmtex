import { runRemoteBiber as d } from "./engine/biber-backend.js";
import { createBiberBackend as re } from "./engine/biber-backend.js";
import { runRemoteBibliography as m, detectBibliographyMode as p, detectBiblatexBackend as b, parseBcfCitedKeys as g, generateBiblatexBbl as x, detectBiblatexSort as F, resolveBstFile as w } from "./engine/bibliography-backend.js";
import { BIBLIOGRAPHY_STAGE as oe, biblatexLiteBackend as ce, selectBiblatexBackend as he } from "./engine/bibliography-backend.js";
import { BibtexEngine as y } from "./engine/bibtex-engine.js";
import { createCompileEngine as B, unavailableEngineResult as E } from "./engine/compile-engine.js";
import { resolveEngine as k } from "./engine/engine-select.js";
import { IncrementalCompiler as I } from "./engine/incremental.js";
import { detectIndexUse as c, runRemoteIndex as C } from "./engine/index-backend.js";
import { createMakeindexBackend as ue } from "./engine/index-backend.js";
import { MakeindexEngine as $ } from "./engine/makeindex-engine.js";
import { buildDiagnostics as T, parseTexErrors as S } from "./engine/parse-errors.js";
import { RerunController as M, signatureOf as j } from "./engine/rerun-controller.js";
import { WasmTexPdftexEngine as v } from "./engine/wasmtex-engine.js";
import { syncAllFilesToEngine as R } from "./fs/engine-sync.js";
import { VirtualFS as h } from "./fs/virtual-fs.js";
import { parseAuxFile as A } from "./lsp/aux-parser.js";
import { rebuildBibIndex as P, parseBibFile as U } from "./lsp/bib-parser.js";
import { ProjectIndex as f } from "./lsp/project-index.js";
import { parseTraceFile as W } from "./lsp/trace-parser.js";
import { BIBER_STAGE as me, BIBTEX_STAGE as pe, BackendRegistry as be, INDEX_STAGE as ge, createJsonTextBackend as xe, createRemoteBackend as Fe } from "./engine/backend-registry.js";
import { MemoryCacheStore as ye, backendCacheKey as Be, contentKey as Ee, withCache as ke } from "./engine/content-cache.js";
import { createXindyBackend as Ce } from "./engine/xindy-backend.js";
function z(l) {
  return l ? l.endsWith("/") ? l : `${l}/` : "/";
}
function O(l) {
  return l.endsWith(".tex") ? l : `${l}.tex`;
}
class ne {
  engine = null;
  engineKind = "pdflatex";
  detection = {
    engine: "pdflatex",
    reason: "default",
    forced: !1
  };
  /** Set when the document needs an engine whose artifact is not available. */
  unavailable = null;
  bibtexEngine = null;
  makeindexEngine = null;
  /** Incremental (checkpoint) compiler, set when `incremental` is on and the active
   *  engine is pdfLaTeX. Null otherwise (XeLaTeX/LuaLaTeX always do a full compile). */
  incremental = null;
  fs;
  projectIndex = new f();
  mainFile;
  assetBaseUrl;
  opts;
  initialized = !1;
  constructor(e = {}) {
    this.opts = e, this.mainFile = e.mainFile ?? "main.tex", this.assetBaseUrl = z(e.assetBaseUrl), this.fs = new h({ empty: !0 });
    for (const [i, t] of Object.entries(e.files ?? {}))
      this.fs.writeFile(i, t), this.updateIndexForFile(i, t);
  }
  /** Engine options shared by every engine kind (binary-specific bits are set
   *  by the factory). */
  engineBaseOpts() {
    const e = {
      assetBaseUrl: this.assetBaseUrl,
      skipFormatPreload: !!this.opts.skipFormatPreload,
      disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
      persistentCache: !!this.opts.persistentCache,
      texliveVersion: this.opts.texliveVersion ?? "2025",
      ...this.opts.warmupCache ? { warmupCache: this.opts.warmupCache } : {}
    };
    return this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), e;
  }
  /** Current main-file content as a string (for engine detection). */
  mainSource() {
    const e = this.fs.readFile(this.mainFile);
    return typeof e == "string" ? e : "";
  }
  /** All project `.tex` sources (path → content), for multi-file incremental compile. */
  projectTexFiles() {
    const e = /* @__PURE__ */ new Map();
    for (const i of this.fs.listFiles()) {
      if (!i.endsWith(".tex")) continue;
      const t = this.fs.readFile(i);
      typeof t == "string" && e.set(i, t);
    }
    return e;
  }
  /**
   * Ensure `this.engine` matches the engine the current main source requires.
   * On a kind change (or first call) it (re)creates and initializes the engine and
   * does a full resync. If a Unicode engine's artifact is unavailable, it records
   * `this.unavailable` instead of throwing (pdfLaTeX failures still throw).
   */
  async ensureEngine() {
    if (this.detection = k(this.mainSource(), this.opts.engine), !(this.engine && this.detection.engine === this.engineKind)) {
      this.engine?.terminate(), this.engineKind = this.detection.engine, this.engine = B(this.detection.engine, this.engineBaseOpts()), this.incremental = this.opts.incremental && this.engine instanceof v ? new I(this.engine, { mainFile: this.mainFile }) : null;
      try {
        await this.engine.init(), this.unavailable = null, await this.syncAllFilesToEngine();
      } catch (e) {
        if (this.detection.engine === "pdflatex") throw e;
        this.unavailable = this.detection;
      }
    }
  }
  async init() {
    this.initialized || (await this.ensureEngine(), this.initialized = !0);
  }
  async compile() {
    if (this.ensureInitialized(), await this.ensureEngine(), this.unavailable || !this.engine)
      return E(this.unavailable ?? this.detection);
    const e = this.engine;
    if (await this.syncModifiedFilesToEngine(), e.setPreambleSnapshot) {
      const s = !this.opts.disablePreambleSnapshot && !c(this.mainSource());
      e.setPreambleSnapshot(s);
    }
    if (this.incremental) {
      const s = performance.now(), a = await this.incremental.tryIncremental(this.mainSource(), this.projectTexFiles());
      if (a?.final && a.pdf) return this.toCompileResult(a, performance.now() - s);
    }
    let i = await e.compile(), t = await this.runAuxStages(i);
    const n = new M();
    for (; (i.success || i.pdf) && !(!n.decide(
      i.log,
      j(i.semanticTrace ?? i.log)
    ).rerun && !t); )
      await this.syncModifiedFilesToEngine(), i = await e.compile(), t = await this.runAuxStages(i);
    return await this.updateMetadata(i), this.incremental?.noteFull(this.mainSource(), this.projectTexFiles(), i.synctex), i;
  }
  /** Map an incremental (checkpoint) result to a CompileResult. The tail log carries this pass's
   *  diagnostics; head errors can't recur (the head is unchanged), and metadata/cross-refs are
   *  unchanged for a `final` result, so the last full compile's project index still holds. The raw
   *  `synctex` is null (the tail compiled in isolation), but `synctexData` carries the tail SyncTeX
   *  spliced onto the last full compile's head — exact for the spliced PDF (#99 P2). */
  toCompileResult(e, i) {
    return {
      success: e.success,
      pdf: e.pdf,
      log: e.log,
      errors: S(e.log),
      compileTime: Math.round(i),
      synctex: null,
      synctexData: e.synctexData ?? null,
      telemetry: { diagnostics: T(e.log) }
    };
  }
  setFile(e, i) {
    if (this.fs.writeFile(e, i), (e.endsWith(".tex") || e.endsWith(".bib")) && !e.endsWith(".bbl")) {
      const t = this.mainFile.replace(/\.tex$/, "");
      this.fs.deleteFile(`${t}.bbl`), this.fs.deleteFile(`${t}.ind`);
    }
    e.endsWith(".tex") || this.incremental?.reset(), this.updateIndexForFile(e, i);
  }
  async loadProject(e) {
    this.fs = new h({ empty: !0 }), this.projectIndex = new f(), this.incremental?.reset();
    for (const [i, t] of Object.entries(e))
      this.fs.writeFile(i, t), this.updateIndexForFile(i, t);
    this.initialized && (this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.makeindexEngine?.terminate(), this.makeindexEngine = null, this.engine && !this.unavailable ? (await this.engine.flushCache(), await this.syncAllFilesToEngine()) : (this.engine?.terminate(), this.engine = null));
  }
  getFile(e) {
    return this.fs.readFile(e);
  }
  listFiles() {
    return this.fs.listFiles();
  }
  getMainFile() {
    return this.mainFile;
  }
  setMainFile(e) {
    this.mainFile = e, this.incremental?.setMainFile(e), this.initialized && this.engine && !this.unavailable && this.engine.setMainFile(e);
  }
  getProjectIndex() {
    return this.projectIndex;
  }
  async readOutput(e) {
    return this.ensureInitialized(), await this.engine?.readFile(e) ?? null;
  }
  async flushCache() {
    this.ensureInitialized(), await this.engine?.flushCache();
  }
  /**
   * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
   * active TeX Live version. No-op when the persistent cache is unavailable.
   */
  async clearCache() {
    await this.engine?.clearCache();
  }
  dispose() {
    this.engine?.terminate(), this.engine = null, this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.makeindexEngine?.terminate(), this.makeindexEngine = null, this.initialized = !1;
  }
  async syncAllFilesToEngine() {
    const e = this.engine;
    !e || this.unavailable || await R(
      this.fs,
      e,
      (i) => this.ensureEngineDirectories(i),
      this.mainFile
    );
  }
  async syncModifiedFilesToEngine() {
    const e = this.engine;
    if (!e || this.unavailable) return;
    const i = this.fs.getModifiedFiles();
    await this.ensureEngineDirectories(i.map((t) => t.path));
    for (const t of i)
      await e.writeFile(t.path, t.content);
    this.fs.markSynced(i), e.setMainFile(this.mainFile);
  }
  async ensureEngineDirectories(e) {
    const i = this.engine;
    if (!i) return;
    const t = /* @__PURE__ */ new Set();
    for (const n of e) {
      const s = n.split("/");
      let a = "";
      for (let r = 0; r < s.length - 1; r++)
        a = a ? `${a}/${s[r]}` : s[r], t.add(a);
    }
    for (const n of Array.from(t).sort())
      await i.mkdir(n);
  }
  updateIndexForFile(e, i) {
    typeof i == "string" && (e.endsWith(".tex") && this.projectIndex.updateFile(e, i), e.endsWith(".bib") && this.updateBibIndex());
  }
  updateBibIndex() {
    P(this.fs, this.projectIndex);
  }
  async updateMetadata(e) {
    if (!this.engine) return;
    const i = this.mainFile.replace(/\.tex$/, ""), t = await this.engine.readFile(`${i}.aux`);
    if (t && this.projectIndex.updateAuxData(A(t)), e.engineCommands?.length && this.projectIndex.updateEngineCommands(e.engineCommands), e.semanticTrace && this.projectIndex.updateSemanticTrace(W(e.semanticTrace)), e.inputFiles?.length)
      for (const n of e.inputFiles) {
        const s = this.fs.getFile(O(n));
        s && typeof s.content == "string" && this.projectIndex.updateFile(s.path, s.content);
      }
  }
  /** Run the auto aux stages (bibliography, then index) after a LaTeX pass. Returns whether
   *  any stage injected a new artifact this pass — if so the caller runs another LaTeX pass
   *  so the engine reads it (a `\printindex`-only document emits no rerun marker). A document
   *  is classic-BibTeX *or* biblatex (never both), so the two bibliography paths gate on
   *  mutually exclusive triggers and at most one fires. */
  async runAuxStages(e) {
    const i = await this.maybeRunBibtex(e) || await this.maybeRunBiblatex(e), t = await this.maybeRunMakeindex(e);
    return i || t;
  }
  /** @returns whether a fresh `.bbl` was injected this pass (forces one more LaTeX pass). */
  async maybeRunBibtex(e) {
    const i = this.engine;
    if (!i || !e.success && !e.pdf || !this.fs.listFiles().some((u) => u.endsWith(".bib"))) return !1;
    const t = this.mainFile.replace(/\.tex$/, ""), n = await i.readFile(`${t}.aux`);
    if (!n?.includes("\\citation{") || !n.includes("\\bibdata{") || this.fs.readFile(`${t}.bbl`)) return !1;
    const s = this.collectBibFiles(), a = { aux: n, bibFiles: s }, r = this.resolveProjectBst(n);
    r && (a.bstFiles = { [r.path]: r.content });
    const o = await m(this.opts.backends, a) ?? await this.runClientBibtex(t, n, s);
    return o ? (this.fs.writeFile(`${t}.bbl`, o), await i.writeFile(`${t}.bbl`, o), !0) : !1;
  }
  /**
   * The biblatex counterpart of {@link maybeRunBibtex}. A biblatex document does **not** write
   * the classic `\bibdata{}`/`\citation{}` markers to the `.aux` (it uses `\abx@aux@cite` and a
   * `.bcf` control file), so {@link maybeRunBibtex}'s gate never fires for it. Here we route the
   * `.bcf` the first LaTeX pass emitted: when `backend=biber` and a **server** Biber backend is
   * registered, run it on `{ bcf, bibFiles }` (full fidelity); otherwise fall back to the bundled
   * biblatex-lite (cite keys parsed from the `.bcf`, entries from the project `.bib`s). Inject the
   * `.bbl` so the next pass resolves `\cite`s.
   * @returns whether a fresh `.bbl` was injected this pass (forces one more LaTeX pass).
   */
  async maybeRunBiblatex(e) {
    const i = this.engine;
    if (!i || !e.success && !e.pdf) return !1;
    const t = this.mainSource();
    if (p(t) !== "biblatex") return !1;
    const n = this.mainFile.replace(/\.tex$/, "");
    if (this.fs.readFile(`${n}.bbl`)) return !1;
    const s = await i.readFile(`${n}.bcf`);
    if (!s?.trim()) return !1;
    const a = this.collectBibFiles(), r = (b(t) === "biber" ? await d(this.opts.backends, { bcf: s, bibFiles: a }) : null) ?? this.runClientBiblatexLite(t, s, a);
    return r ? (this.fs.writeFile(`${n}.bbl`, r), await i.writeFile(`${n}.bbl`, r), !0) : !1;
  }
  /** Bundled biblatex-lite for the bibliography stage → `.bbl`: parse the cited keys from the
   *  `.bcf` and the entries from the project `.bib`s, then generate the documented-subset `.bbl`.
   *  The client default when no server Biber backend is registered (so a biblatex document still
   *  gets a bibliography fully on-device). */
  runClientBiblatexLite(e, i, t) {
    const n = Object.entries(t).flatMap(
      ([r, o]) => U(o, r)
    ), s = g(i), a = s.includes("*") ? n.map((r) => r.key) : s;
    return x({ entries: n, citedKeys: a, sort: F(e) });
  }
  /**
   * Auto-run the index stage for `\printindex` (analogous to {@link maybeRunBibtex}): when
   * the LaTeX pass emitted a non-empty `.idx` and no `.ind` exists yet, turn it into `.ind`
   * — via a registered **server** backend for the `index` stage (makeindex/xindy), else the
   * bundled makeindex WASM (client-first, fully on-device) — and inject it so `\printindex`
   * resolves on the next pass. Gated on the source actually using `\makeindex`+`\printindex`
   * so a stale `.idx` in a reused engine can't add a phantom index.
   * @returns whether a fresh `.ind` was injected this pass (forces one more LaTeX pass).
   */
  async maybeRunMakeindex(e) {
    const i = this.engine;
    if (!i || !e.success && !e.pdf || !c(this.mainSource())) return !1;
    const t = this.mainFile.replace(/\.tex$/, "");
    if (this.fs.readFile(`${t}.ind`)) return !1;
    const n = await i.readFile(`${t}.idx`);
    if (!n?.trim()) return !1;
    const s = { idx: n }, a = await C(this.opts.backends, s) ?? await this.runClientMakeindex(t, n);
    return a ? (this.fs.writeFile(`${t}.ind`, a), await i.writeFile(`${t}.ind`, a), !0) : !1;
  }
  /** Resolve the project-local custom `.bst` named by `\bibliographystyle` (read from the
   *  VFS), or null when the style is bundled / absent. Shared by the client + server paths. */
  resolveProjectBst(e) {
    return w(e, (i) => {
      const t = this.fs.readFile(i);
      return typeof t == "string" ? t : null;
    });
  }
  /** Gather the project's `.bib` databases (path → content) for the bibliography stage. */
  collectBibFiles() {
    const e = {};
    for (const i of this.fs.listFiles()) {
      if (!i.endsWith(".bib")) continue;
      const t = this.fs.readFile(i);
      typeof t == "string" && (e[i] = t);
    }
    return e;
  }
  /** Run the bundled client BibTeX (WASM) engine for the bibliography stage → `.bbl`, or
   *  null if it produced none. The default when no server backend is registered. */
  async runClientBibtex(e, i, t) {
    const n = await this.ensureBibtexEngine();
    await n.writeFile(`${e}.aux`, i);
    for (const [a, r] of Object.entries(t))
      await n.writeFile(a, r);
    const s = this.resolveProjectBst(i);
    return s && await n.writeFile(s.path, s.content), await n.compile(e), await n.readFile(`${e}.bbl`) ?? null;
  }
  /** Shared constructor options for the bundled aux-stage engines (BibTeX, makeindex):
   *  same asset base / TeX Live version / endpoint as the main engine. */
  auxEngineOpts() {
    const e = {
      assetBaseUrl: this.assetBaseUrl,
      texliveVersion: this.opts.texliveVersion ?? "2025"
    };
    return this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), e;
  }
  async ensureBibtexEngine() {
    if (this.bibtexEngine) return this.bibtexEngine;
    const e = new y(this.auxEngineOpts());
    return await e.init(), this.bibtexEngine = e, e;
  }
  /** Run the bundled client makeindex (WASM) engine for the index stage → `.ind`, or null
   *  if it produced none. The default when no server backend is registered for `index`. */
  async runClientMakeindex(e, i) {
    const t = await this.ensureMakeindexEngine();
    return await t.writeFile(`${e}.idx`, i), await t.compile(e), await t.readFile(`${e}.ind`) ?? null;
  }
  async ensureMakeindexEngine() {
    if (this.makeindexEngine) return this.makeindexEngine;
    const e = new $(this.auxEngineOpts());
    return await e.init(), this.makeindexEngine = e, e;
  }
  ensureInitialized() {
    if (!this.initialized)
      throw new Error("WasmTexCompiler is not initialized. Call init() first.");
  }
}
export {
  me as BIBER_STAGE,
  oe as BIBLIOGRAPHY_STAGE,
  pe as BIBTEX_STAGE,
  be as BackendRegistry,
  ge as INDEX_STAGE,
  ye as MemoryCacheStore,
  ne as WasmTexCompiler,
  Be as backendCacheKey,
  ce as biblatexLiteBackend,
  Ee as contentKey,
  re as createBiberBackend,
  xe as createJsonTextBackend,
  ue as createMakeindexBackend,
  Fe as createRemoteBackend,
  Ce as createXindyBackend,
  b as detectBiblatexBackend,
  F as detectBiblatexSort,
  p as detectBibliographyMode,
  c as detectIndexUse,
  x as generateBiblatexBbl,
  g as parseBcfCitedKeys,
  d as runRemoteBiber,
  m as runRemoteBibliography,
  C as runRemoteIndex,
  he as selectBiblatexBackend,
  ke as withCache
};
