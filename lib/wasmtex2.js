import { binaryFileBlob as x } from "./binary-file.js";
import { BinaryPreviewController as v } from "./editor/binary-preview.js";
import { installOpenCodeEditorOverride as C } from "./editor/open-code-editor-override.js";
import { createEditor as y, revealLine as f, createFileModel as S } from "./editor/setup.js";
import { BibtexEngine as R } from "./engine/bibtex-engine.js";
import { unavailableEngineResult as E } from "./engine/compile-engine.js";
import { CompileScheduler as P } from "./engine/compile-scheduler.js";
import { createCompletionSnapshot as B } from "./engine/completion-snapshot.js";
import { normalizeProjectDependencyPath as M } from "./engine/dependency-manifest.js";
import { resolveEngine as I } from "./engine/engine-select.js";
import { IncrementalCompiler as D } from "./engine/incremental.js";
import { buildDiagnostics as u, parseTexErrors as j } from "./engine/parse-errors.js";
import { RerunController as T, signatureOf as U } from "./engine/rerun-controller.js";
import { WasmTexPdftexEngine as A } from "./engine/wasmtex-engine.js";
import { syncAllFilesToEngine as O } from "./fs/engine-sync.js";
import { saveOutgoingFile as L } from "./fs/save-outgoing.js";
import { VirtualFS as m } from "./fs/virtual-fs.js";
import { parseAuxFile as g } from "./lsp/aux-parser.js";
import { rebuildBibIndex as V } from "./lsp/bib-parser.js";
import { computeDiagnostics as k } from "./lsp/diagnostic-provider.js";
import { lintSource as $ } from "./lsp/linter.js";
import { preloadSemanticCatalog as b, createDefaultCompletionRegistry as W } from "./lsp/neutral-providers.js";
import { ProjectIndex as N } from "./lsp/project-index.js";
import { registerLatexProviders as H } from "./lsp/register-providers.js";
import { parseTraceFile as X } from "./lsp/trace-parser.js";
import { initPerfOverlay as z, perf as a } from "./perf/metrics.js";
import { SynctexParser as q } from "./synctex/synctex-parser.js";
/* empty css                   */
import { setErrorMarkers as Y, setDiagnosticMarkers as _ } from "./ui/error-markers.js";
import { PdfViewer as G } from "./viewer/pdf-viewer.js";
const K = /* @__PURE__ */ new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".bmp", ".webp"]), J = 500;
function Q(l) {
  const e = l.lastIndexOf(".");
  return e === -1 ? !1 : K.has(l.substring(e).toLowerCase());
}
function Z(l) {
  return l < 1024 ? `${l} B` : l < 1024 * 1024 ? `${(l / 1024).toFixed(1)} KB` : `${(l / (1024 * 1024)).toFixed(1)} MB`;
}
function w(l, e) {
  const i = typeof l == "string" ? document.querySelector(l) : l;
  if (!i)
    throw new Error(`Failed to initialize ${e}.`);
  if (!(i instanceof HTMLElement))
    throw new Error(`${e} must be a real HTMLElement.`);
  return i;
}
function ee(l) {
  if (l) return l.endsWith("/") ? l : `${l}/`;
  const e = "/";
  return e.endsWith("/") ? e : `${e}/`;
}
class De {
  // --- Options ---
  mainFile;
  opts;
  assetBaseUrl;
  // --- DOM ---
  editorContainer = null;
  previewContainer = null;
  // --- Components ---
  engine;
  fs;
  synctexParser = new q();
  pdfViewer;
  scheduler;
  editor;
  projectIndex = new N();
  lspDisposables = [];
  completionRegistry;
  // --- Models (one per project file, kept alive for cross-file diagnostics) ---
  models = /* @__PURE__ */ new Map();
  modelDisposables = /* @__PURE__ */ new Map();
  // --- State ---
  currentFile;
  runtimeScopeAttribute = "data-wasmtex-runtime";
  pendingRecompile = !1;
  rerunController = new T();
  // Monotonic render token. Each successful compile bumps it; an older render's
  // async .then() compares against it and bails so a superseded compile can't
  // emit a stale 'ready' status (e.g. a stale preambleSnapshot flag).
  renderSeq = 0;
  // Editor subscriptions (model/cursor change, the save action). Tracked so dispose() can
  // detach them — critical when an external editor is supplied, since we never dispose it.
  interactionDisposables = [];
  // Stored so dispose() can removeEventListener it (an anonymous handler leaks one global
  // listener — capturing this instance — per WasmTex created).
  unhandledRejectionHandler = null;
  /** Disposer for the optional ?perf=1 debug overlay (removes the div + unsubscribes). */
  perfOverlayDispose;
  forwardSearchTimer = null;
  rerunTimer = null;
  lastForwardLine = -1;
  lastForwardFile = "";
  switchingModel = !1;
  previewEl = null;
  // Owns the binary-preview overlay's visibility + model-change-suppression decision.
  preview = null;
  // Restores Monaco's openCodeEditor on dispose (an external host editor outlives us).
  openCodeEditorOverride = null;
  // Object URL backing the current binary image preview, tracked so it can be
  // revoked on load, error, replacement, hide, and dispose (avoids blob leaks).
  previewUrl = null;
  bibtexEngine = null;
  bibtexDone = !1;
  pendingBibtex = !1;
  bibtexRunId = 0;
  /** Auxiliary-stage outputs live in the VFS for compilation and inspection but do
   *  not participate in the host-authored project revision. */
  generatedFiles = /* @__PURE__ */ new Set();
  // --- Incremental fast path (#99, opt-in via `incremental`) ---
  // Set when `incremental` is on (pdfLaTeX-only checkpoint fast path). null = always full.
  incremental = null;
  // True between serving a fast (incremental) paint and running its full reconcile. It
  // makes the NEXT scheduled compile a full reconcile (skip the fast path), and tells
  // onCompileResult the current result is a fast paint (keep last-full SyncTeX, don't
  // run bibtex/rerun — the reconcile does that). Reset by every onModelChange.
  reconcileArmed = !1;
  // Speculative checkpoint prebuild (option A): armed when the loop goes idle, cancelled
  // by the next edit. `prebuildInFlight` serialises the worker — a compile awaits it.
  prebuildTimer = null;
  prebuildInFlight = null;
  // True while compileActiveEngine drives the worker (fast path or full). buildCheckpoint/
  // compileFromCheckpoint don't flip the engine's ready status, so runPrebuild consults this to
  // avoid starting a speculative build on top of an in-flight fast-path compile.
  compileInFlight = !1;
  // Bumped on every edit; compileActiveEngine uses it to detect a fast paint superseded mid-flight.
  editEpoch = 0;
  // SyncTeX splice (#99 P2): the exact spliced SyncTeX for the current fast paint (produced by
  // IncrementalCompiler.tryIncremental). When present, applyFastSynctex sets it on the viewer and
  // SKIPS the reconcile — the fast paint is the final result; null → reuse + reconcile.
  pendingFastMerge = null;
  externalEditor = !1;
  disposed = !1;
  // --- Events ---
  listeners = /* @__PURE__ */ new Map();
  constructor(e, i, t = {}) {
    this.opts = t, this.externalEditor = !!this.opts.editor, this.mainFile = this.opts.mainFile ?? "main.tex", this.currentFile = this.mainFile, this.assetBaseUrl = ee(this.opts.assetBaseUrl);
    const s = {
      assetBaseUrl: this.assetBaseUrl,
      skipFormatPreload: !!this.opts.skipFormatPreload,
      disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
      persistentCache: !!this.opts.persistentCache,
      texliveVersion: this.opts.texliveVersion || "2025",
      ...this.opts.warmupCache ? { warmupCache: this.opts.warmupCache } : {}
    };
    if (this.opts.texliveUrl && (s.texliveUrl = this.opts.texliveUrl), this.engine = new A(s), this.engine.onProgress = (n) => {
      this.engine.getStatus() === "loading" && this.setStatus("loading", `${n}%`);
    }, this.engine.onFileDownload = (n) => {
      this.setStatus(this.engine.getStatus(), `fetching ${n}`);
    }, this.opts.incremental && (this.incremental = new D(this.engine, { mainFile: this.mainFile })), this.opts.files) {
      this.fs = new m({ empty: !0 });
      for (const [n, r] of Object.entries(this.opts.files))
        this.fs.writeFile(n, r);
    } else
      this.fs = new m();
    if (this.editorContainer = w(e, "editor container"), this.previewContainer = w(i, "preview container"), this.editorContainer === null)
      throw new Error("Failed to initialize editor container.");
    if (this.previewContainer === null)
      throw new Error("Failed to initialize preview container.");
    this.initComponents();
  }
  initComponents() {
    this.applyContainerBindings(), this.initViewer(), this.initScheduler(), this.initProjectModels(), this.initEditorState(), this.initBinaryPreview(), this.initEditorInteraction(), this.initRuntimeServices();
  }
  applyContainerBindings() {
    !this.editorContainer || !this.previewContainer || (this.runtimeScopeAttribute = this.opts.runtimeScopeAttribute?.trim() || this.runtimeScopeAttribute, this.editorContainer.setAttribute(this.runtimeScopeAttribute, ""), this.previewContainer.setAttribute(this.runtimeScopeAttribute, ""), this.opts.editorContainerClassName && this.editorContainer.classList.add(
      ...this.opts.editorContainerClassName.split(/\s+/).filter(Boolean)
    ), this.opts.previewContainerClassName && this.previewContainer.classList.add(
      ...this.opts.previewContainerClassName.split(/\s+/).filter(Boolean)
    ));
  }
  initViewer() {
    if (!this.previewContainer)
      throw new Error("Preview container is not initialized.");
    this.pdfViewer = new G(this.previewContainer), this.pdfViewer.setInverseSearchHandler((e) => {
      this.revealLine(e.line, e.file);
    }), this.opts.toolbar === !1 && this.pdfViewer.setToolbarVisible(!1);
  }
  initScheduler() {
    this.scheduler = new P(
      {
        isReady: () => this.engine.isReady(),
        compile: () => this.compileActiveEngine()
      },
      (e) => this.onCompileResult(e),
      (e, i) => this.setStatus(e, i),
      { minDebounceMs: 50, maxDebounceMs: 1e3 }
    );
  }
  /** Current main-file content (for engine detection). */
  mainSource() {
    const e = this.fs.readFile(this.mainFile);
    return typeof e == "string" ? e : "";
  }
  /**
   * The engine a Unicode-only document needs, if that engine is not available in
   * this build (the browser currently ships pdfLaTeX only). Returns null when the
   * document compiles with pdfLaTeX.
   */
  unavailableEngine() {
    const e = I(this.mainSource(), this.opts.engine);
    return e.engine === "pdflatex" ? null : e;
  }
  /**
   * Compile with the active engine, but first short-circuit documents that require
   * a Unicode engine (XeLaTeX/LuaLaTeX) not yet shipped in the browser build —
   * surfacing a clear "requires XeLaTeX" result instead of a cryptic pdfTeX error.
   *
   * With `incremental` on (#99), a servable *final* body edit is served from a checkpoint
   * (fast paint, SyncTeX reused from the last full compile); `reconcileArmed` then makes the
   * next scheduled compile a full reconcile. All other edits — and the reconcile itself — run
   * a full compile. Serialised against a speculative prebuild (they share the one worker).
   */
  async compileActiveEngine() {
    const e = this.unavailableEngine();
    if (e) return E(e);
    this.prebuildInFlight && await this.prebuildInFlight, this.compileInFlight = !0;
    try {
      const i = await this.tryFastPaint();
      if (i) return i;
      this.reconcileArmed = !1;
      const t = await this.engine.compile();
      return await this.attachCompletionSnapshot(t), this.incremental?.noteFull(this.mainSource(), this.projectStringFiles(), t.synctex), t;
    } finally {
      this.compileInFlight = !1;
    }
  }
  completionProfile() {
    const e = this.opts.texliveVersion ?? "2025", i = this.opts.resourceCatalog?.identity, t = this.opts.semanticCatalog?.identity, s = [i, t].filter((r) => r !== void 0);
    if (this.opts.completionProfile) {
      if (s.some(
        (r) => r.texliveYear !== e || r.mirrorRevision !== this.opts.completionProfile.mirrorRevision
      ))
        throw new Error("completionProfile does not match the selected completion catalogs");
      return { ...this.opts.completionProfile, texliveYear: e };
    }
    if (i && t && (i.texliveYear !== t.texliveYear || i.mirrorRevision !== t.mirrorRevision))
      throw new Error("resource and semantic completion catalogs use different profiles");
    const n = i && t ? i : i ?? t ?? null;
    return {
      id: n ? `catalog:${n.mirrorRevision}` : `wasmtex:${e}:${this.opts.texliveUrl ?? "default-mirror"}`,
      texliveYear: e,
      mirrorRevision: n?.mirrorRevision ?? null
    };
  }
  async attachCompletionSnapshot(e) {
    if (!e.success || this.fs.getModifiedFiles().length > 0) return;
    const i = this.mainFile, t = this.fs.listFiles().filter((r) => !this.generatedFiles.has(r)).flatMap((r) => {
      const o = this.fs.getFile(r);
      return o ? [
        {
          path: o.path,
          content: typeof o.content == "string" ? o.content : Uint8Array.from(o.content)
        }
      ] : [];
    }), s = this.engine.getCompletionObservation(), n = await B({
      engine: "pdflatex",
      root: i,
      profile: this.completionProfile(),
      projectFiles: t,
      ...e.engineCommands ? { engineCommands: e.engineCommands } : {},
      engineCommandsComplete: e.engineCommandsComplete === !0,
      ...e.engineCommandsDropped !== void 0 ? { engineCommandsDropped: e.engineCommandsDropped } : {},
      ...s ? { engineObservation: s } : {},
      ...e.inputFiles ? { inputFiles: e.inputFiles } : {},
      inputFilesComplete: e.inputFilesComplete === !0
    });
    i !== this.mainFile || this.fs.getModifiedFiles().length > 0 || (e.telemetry ??= { diagnostics: u(e.log) }, e.telemetry.completionSnapshot = n);
  }
  /** Attempt an incremental fast paint (#99); returns the spliced result, or null to signal the
   *  caller to run a full compile. On success arms the reconcile/merge (unless a newer edit
   *  superseded this one mid-flight, in which case the scheduler drops the result and the flags
   *  must NOT be set, or they'd force the next edit to a full compile). */
  async tryFastPaint() {
    const e = this.incremental;
    if (!e || this.reconcileArmed || this.pendingRecompile) return null;
    const i = this.editEpoch, t = this.mainSource(), s = this.projectStringFiles();
    if (!e.canFastServe(t, s)) return null;
    const n = await e.tryIncremental(t, s);
    return !n?.pdf || !n.final ? null : (this.editEpoch === i && (this.reconcileArmed = !0, this.pendingFastMerge = n.synctexData ?? null), this.fastCompileResult(n));
  }
  /** All project files with string content (path → content), for the incremental compiler's
   *  diff/checkpoint bookkeeping. Mirrors the headless compiler's file set. */
  projectStringFiles() {
    const e = /* @__PURE__ */ new Map();
    for (const i of this.fs.listFiles()) {
      const t = this.fs.readFile(i);
      typeof t == "string" && e.set(i, t);
    }
    return e;
  }
  /** Map an incremental (checkpoint) result to a CompileResult for the fast paint. SyncTeX is
   *  null here — the viewer keeps the last full compile's parsed SyncTeX until the reconcile
   *  refreshes it (handleSuccessfulCompile skips handleSynctex for a fast paint). */
  fastCompileResult(e) {
    return {
      success: e.success,
      pdf: e.pdf,
      log: e.log,
      errors: j(e.log),
      compileTime: 0,
      synctex: null,
      telemetry: { diagnostics: u(e.log) }
    };
  }
  /** Arm a speculative checkpoint prebuild once the loop is idle (#99, option A). The next edit
   *  (onModelChange) cancels it; a concurrent compile waits for any in-flight one, and runPrebuild
   *  won't start one while a compile is in flight. No-op without `incremental`. */
  armPrebuild() {
    this.incremental && (this.cancelPrebuild(), !(this.pendingBibtex || this.pendingRecompile || this.reconcileArmed) && (this.prebuildTimer = setTimeout(() => {
      this.prebuildTimer = null, this.runPrebuild();
    }, J)));
  }
  /** Build the checkpoint for the boundary before the cursor, off the critical path. Sets
   *  {@link prebuildInFlight} so compileActiveEngine serialises against it (one worker). */
  async runPrebuild() {
    const e = this.incremental;
    if (!e || this.prebuildInFlight || this.compileInFlight || this.pendingBibtex || this.pendingRecompile || this.reconcileArmed || this.engine.getStatus() !== "ready") return;
    const i = this.mainSource(), t = this.projectStringFiles(), s = this.cursorMainOffset();
    this.prebuildInFlight = e.prebuild(i, t, s).then(() => {
    }).catch(() => {
    });
    try {
      await this.prebuildInFlight;
    } finally {
      this.prebuildInFlight = null;
    }
  }
  cancelPrebuild() {
    this.prebuildTimer && (clearTimeout(this.prebuildTimer), this.prebuildTimer = null);
  }
  /** The cursor's byte offset in the main source, as the prebuild boundary hint. Falls back
   *  to end-of-document when the cursor isn't in the main file (multi-file) or is unavailable
   *  — end maps to the last page break, the common "writing forward" case. */
  cursorMainOffset() {
    const e = this.mainSource();
    if (this.currentFile !== this.mainFile) return e.length;
    const i = this.models.get(this.mainFile), t = this.editor?.getPosition();
    if (!i || !t) return e.length;
    try {
      return i.getOffsetAt(t);
    } catch {
      return e.length;
    }
  }
  initProjectModels() {
    for (const e of this.fs.listFiles()) {
      const i = this.fs.getFile(e);
      i && typeof i.content == "string" && (this.ensureModel(e, i.content), e.endsWith(".tex") && this.updateProjectIndex(e, i.content));
    }
    this.updateBibIndex(), this.models.has(this.currentFile) || this.ensureModel(this.currentFile, "");
  }
  initEditorState() {
    const e = this.models.get(this.currentFile);
    if (!e)
      throw new Error("Initial model is not available.");
    if (this.opts.editor)
      this.editor = this.opts.editor, this.switchingModel = !0, this.editor.setModel(e), this.switchingModel = !1;
    else {
      if (!this.editorContainer)
        throw new Error("Editor container is not initialized.");
      this.editor = y(this.editorContainer, e);
    }
    const i = this.editor._codeEditorService;
    i && (this.openCodeEditorOverride = C(
      i,
      async (t, s, n, r) => {
        const o = t, h = await r(o, s, n);
        if (!h && o.resource) {
          const c = o.resource.toString();
          for (const [d, F] of this.models.entries())
            if (F.uri.toString() === c) {
              if (this.onFileSelect(d), o.options?.selection) {
                const p = o.options.selection;
                this.editor.setSelection(p), this.editor.revealRangeInCenter(p);
              }
              return !0;
            }
        }
        return h;
      }
    ));
  }
  initBinaryPreview() {
    this.previewEl = document.createElement("div"), this.previewEl.className = "binary-preview", this.previewEl.style.display = "none", this.editorContainer?.appendChild(this.previewEl), this.preview = new v(this.previewEl);
  }
  initEditorInteraction() {
    this.interactionDisposables.push(
      this.editor.onDidChangeModel(() => {
        const e = this.editor.getModel();
        if (!(this.switchingModel || !e)) {
          for (const [i, t] of this.models.entries())
            if (t === e) {
              this.currentFile !== i && (this.currentFile = i, this.emit("fileOpen", { path: i }), this.emitOutline(), this.runDiagnostics());
              break;
            }
        }
      })
    ), this.interactionDisposables.push(
      this.editor.onDidChangeCursorPosition(() => {
        if (this.switchingModel) return;
        const e = this.editor.getPosition();
        e && (this.emit("cursorChange", {
          path: this.currentFile,
          line: e.lineNumber,
          column: e.column
        }), !(e.lineNumber === this.lastForwardLine && this.currentFile === this.lastForwardFile) && (this.lastForwardLine = e.lineNumber, this.lastForwardFile = this.currentFile, this.forwardSearchTimer && clearTimeout(this.forwardSearchTimer), this.forwardSearchTimer = setTimeout(() => {
          this.pdfViewer?.forwardSearch(this.currentFile, e.lineNumber);
        }, 100), this.armPrebuild()));
      })
    ), this.interactionDisposables.push(
      this.editor.addAction({
        id: "latex.save-compile",
        label: "Save & Compile",
        keybindings: [
          2097
          /* KeyS */
        ],
        run: () => {
          this.syncAndCompile().then(() => this.scheduler.flush());
        }
      })
    ), this.pdfViewer?.setDownloadHandler(() => this.downloadPdf());
  }
  updateProjectIndex(e, i) {
    this.projectIndex.updateFile(e, i), this.completionRegistry && b(this.completionRegistry, this.projectIndex);
  }
  initRuntimeServices() {
    this.completionRegistry = W({
      ...this.opts.resourceCatalog ? { resourceCatalog: this.opts.resourceCatalog } : {},
      ...this.opts.semanticCatalog ? { semanticCatalog: this.opts.semanticCatalog } : {}
    }), b(this.completionRegistry, this.projectIndex), this.lspDisposables = H(
      this.projectIndex,
      this.fs,
      (e) => this.emit("workspaceEdit", e),
      "latex",
      this.completionRegistry
    ), this.perfOverlayDispose = z(), this.unhandledRejectionHandler = (e) => {
      (e.reason?.message === "Canceled" || e.reason === "You cannot rename this element.") && e.preventDefault();
    }, window.addEventListener("unhandledrejection", this.unhandledRejectionHandler), this.opts.serviceWorker !== !1 && "serviceWorker" in navigator && navigator.serviceWorker.register(`${this.assetBaseUrl}sw.js`).catch((e) => {
      console.warn("SW registration failed:", e);
    });
  }
  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  async init() {
    this.setStatus("loading");
    try {
      await this.engine.init(), await O(
        this.fs,
        this.engine,
        (i) => this.ensureEngineDirectories(i),
        this.mainFile
      ), this.setStatus("compiling");
      const e = await this.compileActiveEngine();
      this.onCompileResult(e);
    } catch (e) {
      console.error("Engine initialization failed:", e), this.setStatus("error", String(e));
    }
  }
  // --- File management ---
  /** Load a complete project state. */
  loadProject(e) {
    const i = new Set(this.models.keys()), t = new Set(Object.keys(e));
    this.generatedFiles.clear();
    for (const n of this.fs.listFiles())
      this.fs.deleteFile(n), this.projectIndex.removeFile(n);
    this.engine.flushCache(), this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.pendingBibtex = !1, this.pendingRecompile = !1, this.reconcileArmed = !1, this.pendingFastMerge = null, this.cancelPendingRerun(), this.cancelPrebuild(), this.incremental?.reset(), this.bibtexRunId++, this.rerunController.reset(), this.updateModels(e, i, t), this.updateBibIndex(), this.bibtexDone = !1, this.hideBinaryPreview(), this.currentFile = this.mainFile, this.emit("fileOpen", { path: this.currentFile }), this.lastForwardLine = -1, this.lastForwardFile = "";
    const s = this.models.get(this.currentFile);
    s && this.editor && (this.switchingModel = !0, this.editor.setModel(s), this.switchingModel = !1), this.emit("filesUpdate", { files: this.fs.listFiles() }), this.emitOutline(), this.syncAndCompile();
  }
  updateModels(e, i, t) {
    for (const [s, n] of Object.entries(e))
      if (this.fs.writeFile(s, n), typeof n == "string") {
        s.endsWith(".tex") && this.updateProjectIndex(s, n);
        const r = this.models.get(s);
        r ? this.opts.collaboration || r.setValue(n) : this.ensureModel(s, n);
      }
    for (const s of i)
      t.has(s) || this.disposeModel(s);
  }
  /** Export all project files. */
  saveProject() {
    this.editor && this.fs.writeFile(this.currentFile, this.editor.getValue());
    const e = {};
    for (const i of this.fs.listFiles()) {
      const t = this.fs.getFile(i);
      t && (e[i] = t.content);
    }
    return e;
  }
  /** Open a specific file in the editor. */
  openFile(e) {
    this.onFileSelect(e);
  }
  /** Update or create a single file. */
  setFile(e, i) {
    const t = !this.fs.getFile(e);
    if (this.projectIndex.invalidateCompletionSnapshot(), this.generatedFiles.delete(e), this.fs.writeFile(e, i), e.endsWith(".tex") || this.incremental?.reset(), typeof i == "string") {
      e.endsWith(".tex") && this.updateProjectIndex(e, i), e.endsWith(".bib") && this.updateBibIndex();
      const s = this.models.get(e);
      s ? this.opts.collaboration || s.setValue(i) : this.ensureModel(e, i);
    }
    this.emit("filechange", { path: e, content: i }), t && this.emit("filesUpdate", { files: this.fs.listFiles() }), e === this.currentFile && this.emitOutline();
  }
  /** Read file content. */
  getFile(e) {
    return this.fs.readFile(e);
  }
  /** Delete a file. */
  deleteFile(e) {
    this.disposeModel(e), this.projectIndex.removeFile(e);
    const i = this.fs.deleteFile(e);
    return i && (this.generatedFiles.delete(e), this.incremental?.reset(), this.reconcileArmed = !1, this.pendingFastMerge = null, this.cancelPrebuild(), e.endsWith(".bib") && this.updateBibIndex(), this.engine.flushCache(), this.fs.markAllModified(), this.emit("filesUpdate", { files: this.fs.listFiles() }), this.currentFile === e && this.openFile(this.mainFile), this.syncAndCompile()), i;
  }
  /** Create a folder (represented by a .gitkeep file). */
  createFolder(e) {
    const i = e.replace(/\/+$/, "");
    this.setFile(`${i}/.gitkeep`, "");
  }
  /** List all files in the project. */
  listFiles() {
    return this.fs.listFiles();
  }
  /**
   * Clear the built-in persistent TeX Live asset cache (IndexedDB) for the
   * active TeX Live version. No-op when the persistent cache is unavailable.
   */
  async clearCache() {
    await this.engine.clearCache();
  }
  // --- Compilation ---
  /** Trigger an immediate compilation. */
  compile() {
    this.syncAndCompile().then(() => this.scheduler.flush());
  }
  /** Get the last rendered PDF as bytes. */
  getPdf() {
    return this.pdfViewer?.getLastPdf() ?? null;
  }
  /** Runtime completion evidence from the latest full compile. Any project edit
   *  changes this to `stale` immediately until a matching compile finishes. */
  getCompletionSnapshotState() {
    return this.projectIndex.getCompletionSnapshotState();
  }
  // --- Events ---
  on(e, i) {
    let t = this.listeners.get(e);
    t || (t = /* @__PURE__ */ new Set(), this.listeners.set(e, t)), t.add(i);
  }
  off(e, i) {
    this.listeners.get(e)?.delete(i);
  }
  // --- Escape hatches ---
  /** Get the raw Monaco editor instance. */
  getMonacoEditor() {
    return this.editor;
  }
  /** Get the Monaco model for a project file.
   *  Useful for attaching external bindings (e.g. y-monaco). */
  getModel(e) {
    return this.models.get(e);
  }
  /** Get the built-in PDF viewer instance. */
  getViewer() {
    return this.pdfViewer;
  }
  /** Get the path of the file currently open in the editor. */
  getActiveFile() {
    return this.currentFile;
  }
  /** Jump the editor to a specific line. */
  revealLine(e, i) {
    i && i !== this.currentFile ? (this.openFile(i), requestAnimationFrame(() => f(this.editor, e))) : f(this.editor, e);
  }
  /** Cancel a pending debounced forward search (cursor-move → PDF jump). */
  cancelForwardSearch() {
    this.forwardSearchTimer && (clearTimeout(this.forwardSearchTimer), this.forwardSearchTimer = null);
  }
  // --- Cleanup ---
  dispose() {
    if (!this.disposed) {
      this.disposed = !0, this.scheduler.cancel(), this.cancelForwardSearch(), this.revokePreviewUrl(), this.cancelPendingRerun(), this.cancelPrebuild(), this.unhandledRejectionHandler && (window.removeEventListener("unhandledrejection", this.unhandledRejectionHandler), this.unhandledRejectionHandler = null);
      for (const e of this.lspDisposables) e.dispose();
      this.lspDisposables = [], this.completionRegistry = void 0;
      for (const e of this.interactionDisposables) e.dispose();
      this.interactionDisposables = [], this.openCodeEditorOverride?.dispose(), this.openCodeEditorOverride = null, this.externalEditor || this.editor?.dispose();
      for (const e of this.modelDisposables.values()) e.dispose();
      this.modelDisposables.clear();
      for (const e of this.models.values()) e.dispose();
      this.models.clear(), this.perfOverlayDispose?.(), this.perfOverlayDispose = void 0, this.pdfViewer?.destroy(), this.engine.terminate(), this.bibtexEngine?.terminate(), this.listeners.clear();
    }
  }
  // ------------------------------------------------------------------
  // Private: Model management
  // ------------------------------------------------------------------
  ensureModel(e, i) {
    let t = this.models.get(e);
    if (!t) {
      t = S(i, e, !this.opts.collaboration), this.models.set(e, t);
      const s = t.onDidChangeContent(() => {
        this.onModelChange(e, t.getValue());
      });
      this.modelDisposables.set(e, s), this.emit("modelCreate", { path: e, model: t });
    }
    return t;
  }
  disposeModel(e) {
    const i = this.models.get(e);
    i && (this.emit("modelDispose", { path: e }), this.modelDisposables.get(e)?.dispose(), this.modelDisposables.delete(e), i.dispose(), this.models.delete(e));
  }
  // ------------------------------------------------------------------
  // Private: DOM
  // ------------------------------------------------------------------
  // ------------------------------------------------------------------
  // Private: Core logic
  // ------------------------------------------------------------------
  setStatus(e, i, t) {
    if (this.pdfViewer) {
      const n = {
        unloaded: "Initializing...",
        loading: "Loading engine...",
        ready: "Ready",
        compiling: "Compiling...",
        error: "Error",
        rendering: "Rendering PDF..."
      }, r = i ? `${n[e]} ${i}` : n[e];
      this.pdfViewer.setLoadingStatus(r);
    }
    const s = { status: e };
    i !== void 0 && (s.message = i), t?.preambleSnapshot && (s.preambleSnapshot = !0), t?.incremental && (s.incremental = !0), this.emit("status", s);
  }
  async syncAndCompile() {
    const e = this.engine.getStatus();
    if (e === "unloaded" || e === "loading" || e === "error") return;
    const i = this.fs.getModifiedFiles();
    await this.ensureEngineDirectories(i.map((t) => t.path));
    for (const t of i)
      await this.engine.writeFile(t.path, t.content);
    this.fs.markSynced(i), this.engine.setMainFile(this.mainFile), this.scheduler.schedule();
  }
  async ensureEngineDirectories(e) {
    const i = /* @__PURE__ */ new Set();
    for (const t of e) {
      const s = t.split("/");
      let n = "";
      for (let r = 0; r < s.length - 1; r++)
        n = n ? `${n}/${s[r]}` : s[r], i.add(n);
    }
    for (const t of Array.from(i).sort())
      await this.engine.mkdir(t);
  }
  onModelChange(e, i) {
    this.preview?.shouldSuppressModelChange(e, this.currentFile) || (a.mark("total"), a.mark("debounce"), this.bibtexDone = !1, this.bibtexRunId++, this.pendingBibtex = !1, this.pendingRecompile = !1, this.editEpoch++, this.reconcileArmed = !1, this.pendingFastMerge = null, this.cancelPendingRerun(), this.cancelPrebuild(), this.rerunController.reset(), e.endsWith(".tex") || this.incremental?.reset(), this.projectIndex.invalidateCompletionSnapshot(), this.generatedFiles.delete(e), this.fs.writeFile(e, i), e.endsWith(".tex") && this.updateProjectIndex(e, i), e.endsWith(".bib") && this.updateBibIndex(), e === this.currentFile && this.emitOutline(), this.runDiagnostics(), this.emit("filechange", { path: e, content: i }), this.syncAndCompile());
  }
  onFileSelect(e) {
    const i = this.fs.getFile(e);
    if (!i) return;
    const t = this.preview?.isVisible() ?? !1;
    if (this.editor && !t) {
      const n = this.editor.getValue();
      L(this.fs, this.currentFile, n) && this.currentFile.endsWith(".tex") && this.updateProjectIndex(this.currentFile, n);
    }
    if (this.currentFile = e, this.emit("fileOpen", { path: e }), this.lastForwardLine = -1, this.lastForwardFile = "", this.cancelForwardSearch(), i.content instanceof Uint8Array) {
      this.showBinaryPreview(e, i.content);
      return;
    }
    this.hideBinaryPreview(), typeof i.content == "string" && !this.models.has(e) && this.ensureModel(e, i.content);
    const s = this.models.get(e);
    s && this.editor && (this.switchingModel = !0, this.editor.setModel(s), this.switchingModel = !1), this.emitOutline(), this.runDiagnostics();
  }
  /** Revoke the object URL backing the current binary preview, if any. */
  revokePreviewUrl() {
    this.previewUrl && (URL.revokeObjectURL(this.previewUrl), this.previewUrl = null);
  }
  showBinaryPreview(e, i) {
    if (this.previewEl) {
      if (this.revokePreviewUrl(), this.previewEl.innerHTML = "", Q(e)) {
        const t = x(i), s = URL.createObjectURL(t);
        this.previewUrl = s;
        const n = document.createElement("img");
        n.src = s, n.className = "binary-preview-img";
        const r = () => {
          URL.revokeObjectURL(s), this.previewUrl === s && (this.previewUrl = null);
        };
        n.onload = r, n.onerror = r, this.previewEl.appendChild(n);
      } else {
        const t = document.createElement("div");
        t.className = "binary-preview-info";
        const s = e.substring(e.lastIndexOf("."));
        t.textContent = `${s.toUpperCase()} file — ${Z(i.length)}`, this.previewEl.appendChild(t);
      }
      this.preview?.show();
    }
  }
  hideBinaryPreview() {
    this.revokePreviewUrl(), this.preview?.hide();
  }
  updateEngineMetadata(e) {
    e.semanticTrace ? this.projectIndex.updateSemanticTrace(X(e.semanticTrace)) : this.projectIndex.updateSemanticTrace({ labels: /* @__PURE__ */ new Set(), refs: /* @__PURE__ */ new Set() }), e.inputFiles?.length && this.updateRecordedInputMetadata(e.inputFiles);
    const i = e.telemetry?.completionSnapshot;
    i ? this.projectIndex.updateCompletionSnapshot(i) : e.engineCommands?.length && this.projectIndex.getCompletionSnapshotStatus() === "absent" && this.projectIndex.updateEngineCommands(e.engineCommands);
  }
  updateRecordedInputMetadata(e) {
    for (const i of e) {
      const t = M(i);
      if (!t || this.projectIndex.getFileSymbols(t)) continue;
      const s = this.fs.getFile(t);
      !s || typeof s.content != "string" || (this.updateProjectIndex(t, s.content), this.ensureModel(t, s.content));
    }
  }
  onCompileResult(e) {
    a.end("compile");
    const i = this.reconcileArmed, t = ++this.renderSeq, s = {
      preambleSnapshot: !!e.preambleSnapshot
    };
    this.updateEngineMetadata(e), e.format && this.downloadFormat(e.format), e.success && e.pdf ? this.handleSuccessfulCompile(e, s, t, i) : (a.end("total"), console.error("[engine] compilation failed. memlog:", e.log), this.setStatus(e.errors.length > 0 ? "error" : "ready", void 0, s)), this.handlePostCompile(e, i);
  }
  handleSuccessfulCompile(e, i, t, s = !1) {
    s && (i = { ...i, incremental: !0 });
    const n = [];
    for (const r of this.fs.listFiles()) {
      const o = this.fs.getFile(r);
      o && typeof o.content == "string" && n.push([r, o.content]);
    }
    this.pdfViewer?.setSources(n), s || this.handleSynctex(e, t), this.pdfViewer ? (this.setStatus("rendering"), a.mark("render"), this.pdfViewer.render(e.pdf).then(() => {
      a.end("render"), a.end("total"), t === this.renderSeq && this.setStatus("ready", void 0, i);
    }).catch((r) => {
      a.end("render"), a.end("total"), t === this.renderSeq && (console.error("PDF render failed:", r), this.setStatus("error", "Failed to display PDF"));
    })) : (a.end("total"), this.setStatus("ready", void 0, i));
  }
  handlePostCompile(e, i = !1) {
    if (i) {
      const t = this.pendingFastMerge;
      this.pendingFastMerge = null, this.emitOutline(), this.runDiagnostics(), this.emit("compile", { result: e }), this.applyFastSynctex(t);
      return;
    }
    Y(e.errors, this.models.values()), this.updateAuxIndex(), this.emitOutline(), this.runDiagnostics(), this.pendingBibtex || this.maybeRunBibtex(e), this.pendingBibtex || this.maybeRecompile(e), this.emit("compile", { result: e }), this.armPrebuild();
  }
  /** Apply a fast paint's SyncTeX (#99 P2). `merged` is the tail spliced onto the last full
   *  compile's head (produced inside IncrementalCompiler.tryIncremental) — exact for the spliced
   *  PDF. When present, set it and SKIP the reconcile: the fast paint IS the final result (head
   *  unchanged, cross-references stable for a `final` edit). When null (head changed since the last
   *  full compile / no last-full SyncTeX), keep the last full compile's data and arm the reconcile. */
  applyFastSynctex(e) {
    e ? (this.pdfViewer?.setSynctexData(e), this.reconcileArmed = !1) : this.scheduler.schedule();
  }
  handleSynctex(e, i) {
    e.synctex ? (a.mark("synctex-parse"), this.synctexParser.parse(e.synctex).then((t) => {
      a.end("synctex-parse"), i === this.renderSeq && this.pdfViewer?.setSynctexData(t);
    }).catch((t) => {
      a.end("synctex-parse"), console.warn("SyncTeX parse failed, using text-mapper fallback:", t), i === this.renderSeq && this.pdfViewer?.setSynctexData(null);
    })) : this.pdfViewer?.setSynctexData(null);
  }
  /** Cancel a queued cross-reference rerun (armed by {@link maybeRecompile}). A state
   *  reset — a fresh edit, a new project, or dispose — must cancel it, or the stale
   *  timer fires ~100ms later and runs a redundant, scheduler-bypassing compile of the
   *  now-superseded document (status flicker + wasted work). */
  cancelPendingRerun() {
    this.rerunTimer && (clearTimeout(this.rerunTimer), this.rerunTimer = null);
  }
  maybeRecompile(e) {
    if (this.pendingRecompile || !(e.success || e.pdf)) {
      this.pendingRecompile = !1;
      return;
    }
    const i = U(e.semanticTrace ?? e.log), t = this.rerunController.decide(e.log || "", i);
    if (t.rerun) {
      console.log("[main] Log indicates references changed. Triggering automated rerun..."), this.pendingRecompile = !0, this.rerunTimer = setTimeout(() => {
        this.compileActiveEngine().then((s) => {
          this.pendingRecompile = !1, this.onCompileResult(s), this.syncAndCompile();
        }).catch((s) => {
          this.pendingRecompile = !1, s instanceof Error && s.name === "AbortError" || console.error("[main] Automated rerun failed:", s);
        });
      }, 100);
      return;
    }
    this.pendingRecompile = !1, t.stopped === "limit" ? (console.warn("[main] Rerun limit reached; cross-references may be stale."), this.setStatus("ready", "cross-references may be stale (rerun limit reached)")) : t.stopped === "no-progress" && (console.warn("[main] Reruns did not converge; stopping."), this.setStatus("ready", "cross-references did not converge"));
  }
  maybeRunBibtex(e) {
    if (this.pendingRecompile || this.pendingBibtex || this.bibtexDone || !e.success && !e.pdf || !this.fs.listFiles().some((s) => s.endsWith(".bib"))) return;
    console.log("[main] Triggering BibTeX run..."), this.pendingBibtex = !0;
    const t = ++this.bibtexRunId;
    this.runBibtexChain(t).catch((s) => {
      console.warn("BibTeX chain error:", s);
    }).finally(() => {
      this.bibtexRunId === t && (this.pendingBibtex = !1);
    });
  }
  isCurrentBibtexRun(e) {
    return this.bibtexRunId === e;
  }
  async runBibtexChain(e) {
    const i = this.mainFile.replace(/\.tex$/, ""), t = await this.engine.readFile(`${i}.aux`);
    if (!this.isCurrentBibtexRun(e) || !t || !t.includes("\\citation{") || !t.includes("\\bibdata{")) return;
    this.setStatus("compiling", "Running BibTeX...");
    const s = await this.ensureBibtexEngine();
    if (!this.isCurrentBibtexRun(e) || !s || (await this.sendFilesToBibtex(s, i, t), !this.isCurrentBibtexRun(e)) || (await s.compile(i), !this.isCurrentBibtexRun(e))) return;
    const n = await s.readFile(`${i}.bbl`);
    if (!this.isCurrentBibtexRun(e)) return;
    if (!n) {
      console.warn("[main] BibTeX finished but no .bbl was produced."), this.setStatus("error", "BibTeX did not produce a .bbl file.");
      return;
    }
    if (this.bibtexDone = !0, console.log(`[main] BibTeX produced .bbl (${n.length} bytes). Writing back to engine...`), await this.engine.writeFile(`${i}.bbl`, n), !this.isCurrentBibtexRun(e)) return;
    this.projectIndex.invalidateCompletionSnapshot(), this.fs.writeFile(`${i}.bbl`, n), this.generatedFiles.add(`${i}.bbl`), this.emit("filesUpdate", { files: this.fs.listFiles() }), this.pendingRecompile = !0;
    const r = await this.engine.compile().finally(() => {
      this.pendingRecompile = !1;
    });
    this.isCurrentBibtexRun(e) && (await this.attachCompletionSnapshot(r), this.onCompileResult(r), await this.syncAndCompile());
  }
  async ensureBibtexEngine() {
    if (this.bibtexEngine) return this.bibtexEngine;
    const e = {
      assetBaseUrl: this.assetBaseUrl,
      texliveVersion: this.opts.texliveVersion || "2025"
    };
    this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), this.bibtexEngine = new R(e), this.bibtexEngine.onFileDownload = (i) => {
      this.setStatus("compiling", `fetching ${i}`);
    };
    try {
      return await this.bibtexEngine.init(), this.bibtexEngine;
    } catch (i) {
      return console.warn("BibTeX engine init failed:", i), this.bibtexEngine = null, null;
    }
  }
  async sendFilesToBibtex(e, i, t) {
    await e.writeFile(`${i}.aux`, t);
    const s = this.fs.listFiles().filter((c) => c.endsWith(".bib"));
    for (const c of s) {
      const d = this.fs.readFile(c);
      d != null && await e.writeFile(c, d);
    }
    const n = t.match(/\\bibstyle\{([^}]+)\}/);
    if (!n) return;
    const r = n[1], o = r.endsWith(".bst") ? r : `${r}.bst`, h = this.fs.readFile(o);
    h != null && e.writeFile(o, h);
  }
  updateBibIndex() {
    V(this.fs, this.projectIndex);
  }
  updateAuxIndex() {
    const e = this.mainFile.replace(/\.tex$/, "");
    this.engine.readFile(`${e}.aux`).then((i) => {
      if (!i) return;
      const t = g(i), s = t.includes.map(
        (n) => this.engine.readFile(n).then((r) => r ? g(r) : null)
      );
      Promise.all(s).then((n) => {
        for (const r of n)
          if (r) {
            for (const [o, h] of r.labels) t.labels.set(o, h);
            for (const o of r.citations) t.citations.add(o);
          }
        this.projectIndex.updateAuxData(t), this.runDiagnostics();
      });
    }).catch(() => {
    });
  }
  runDiagnostics() {
    const e = k(this.projectIndex), i = this.opts.lint ?? !0;
    if (i !== !1) {
      const t = i === !0 ? void 0 : i;
      for (const s of this.fs.listFiles()) {
        if (!s.endsWith(".tex")) continue;
        const n = this.fs.getFile(s);
        n && typeof n.content == "string" && e.push(...$(n.content, s, t));
      }
    }
    _(e, this.models.values()), this.emit("diagnostics", { diagnostics: e });
  }
  downloadPdf() {
    const e = this.pdfViewer?.getLastPdf();
    if (!e) return;
    const i = new Blob([e.buffer], { type: "application/pdf" }), t = URL.createObjectURL(i), s = document.createElement("a");
    s.href = t, s.download = "output.pdf", s.click(), URL.revokeObjectURL(t);
  }
  downloadFormat(e) {
    const i = new Blob([e.buffer], { type: "application/octet-stream" }), t = URL.createObjectURL(i), s = document.createElement("a");
    s.href = t, s.download = "wasmtex-pdftex.fmt", s.click(), URL.revokeObjectURL(t);
  }
  emitOutline() {
    const e = this.projectIndex.getFileSymbols(this.currentFile);
    this.emit("outlineUpdate", { sections: e?.sections ?? [] });
  }
  // ------------------------------------------------------------------
  // Private: Event emitter
  // ------------------------------------------------------------------
  emit(e, i) {
    const t = this.listeners.get(e);
    if (t)
      for (const s of t) s(i);
  }
}
export {
  De as WasmTex
};
