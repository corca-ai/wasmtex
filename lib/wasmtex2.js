import { createEditor as e, createFileModel as t, revealLine as n } from "./editor/setup.js";
import { createCompletionSnapshot as r } from "./engine/completion-snapshot.js";
import { lintSource as i } from "./lsp/linter.js";
import { binaryFileBlob as a } from "./binary-file.js";
import { BinaryPreviewController as o } from "./editor/binary-preview.js";
import { installOpenCodeEditorOverride as s } from "./editor/open-code-editor-override.js";
import { BibtexEngine as c } from "./engine/bibtex-engine.js";
import { buildDiagnostics as l, parseTexErrors as u } from "./engine/parse-errors.js";
import { WasmTexPdftexEngine as d } from "./engine/wasmtex-engine.js";
import { unavailableEngineResult as f } from "./engine/compile-engine.js";
import { initPerfOverlay as p, perf as m } from "./perf/metrics.js";
import { CompileScheduler as h } from "./engine/compile-scheduler.js";
import { normalizeProjectDependencyPath as g } from "./engine/dependency-manifest.js";
import { resolveEngine as _ } from "./engine/engine-select.js";
import { SynctexParser as v } from "./synctex/synctex-parser.js";
import { IncrementalCompiler as y } from "./engine/incremental.js";
import { RerunController as b, signatureOf as x } from "./engine/rerun-controller.js";
import { syncAllFilesToEngine as S } from "./fs/engine-sync.js";
import { saveOutgoingFile as C } from "./fs/save-outgoing.js";
import { VirtualFS as w } from "./fs/virtual-fs.js";
import { parseAuxFile as T } from "./lsp/aux-parser.js";
import { rebuildBibIndex as E } from "./lsp/bib-parser.js";
import { computeDiagnostics as D } from "./lsp/diagnostic-provider.js";
import { createDefaultCompletionRegistry as O, preloadSemanticCatalog as k } from "./lsp/neutral-providers.js";
import { ProjectIndex as A } from "./lsp/project-index.js";
import { registerLatexProviders as j } from "./lsp/register-providers.js";
import { parseTraceFile as M } from "./lsp/trace-parser.js";
/* empty css                   */
import { setDiagnosticMarkers as N, setErrorMarkers as P } from "./ui/error-markers.js";
import { PdfViewer as F } from "./viewer/pdf-viewer.js";
//#region src/wasmtex.ts
var I = /* @__PURE__ */ new Set([
	".png",
	".jpg",
	".jpeg",
	".gif",
	".svg",
	".bmp",
	".webp"
]), L = 500;
function R(e) {
	let t = e.lastIndexOf(".");
	return t !== -1 && I.has(e.substring(t).toLowerCase());
}
function z(e) {
	return e < 1024 ? `${e} B` : e < 1048576 ? `${(e / 1024).toFixed(1)} KB` : `${(e / 1048576).toFixed(1)} MB`;
}
function B(e, t) {
	let n = typeof e == "string" ? document.querySelector(e) : e;
	if (!n) throw Error(`Failed to initialize ${t}.`);
	if (!(n instanceof HTMLElement)) throw Error(`${t} must be a real HTMLElement.`);
	return n;
}
function V(e) {
	return e ? e.endsWith("/") ? e : `${e}/` : "/".endsWith("/") ? "/" : "//";
}
var H = class {
	mainFile;
	opts;
	assetBaseUrl;
	editorContainer = null;
	previewContainer = null;
	engine;
	fs;
	synctexParser = new v();
	pdfViewer;
	scheduler;
	editor;
	projectIndex = new A();
	lspDisposables = [];
	completionRegistry;
	models = /* @__PURE__ */ new Map();
	modelDisposables = /* @__PURE__ */ new Map();
	currentFile;
	runtimeScopeAttribute = "data-wasmtex-runtime";
	pendingRecompile = !1;
	rerunController = new b();
	renderSeq = 0;
	interactionDisposables = [];
	unhandledRejectionHandler = null;
	perfOverlayDispose;
	forwardSearchTimer = null;
	rerunTimer = null;
	lastForwardLine = -1;
	lastForwardFile = "";
	switchingModel = !1;
	previewEl = null;
	preview = null;
	openCodeEditorOverride = null;
	previewUrl = null;
	bibtexEngine = null;
	bibtexDone = !1;
	pendingBibtex = !1;
	bibtexRunId = 0;
	generatedFiles = /* @__PURE__ */ new Set();
	incremental = null;
	reconcileArmed = !1;
	prebuildTimer = null;
	prebuildInFlight = null;
	compileInFlight = !1;
	editEpoch = 0;
	pendingFastMerge = null;
	externalEditor = !1;
	disposed = !1;
	listeners = /* @__PURE__ */ new Map();
	constructor(e, t, n = {}) {
		this.opts = n, this.externalEditor = !!this.opts.editor, this.mainFile = this.opts.mainFile ?? "main.tex", this.currentFile = this.mainFile, this.assetBaseUrl = V(this.opts.assetBaseUrl);
		let r = {
			assetBaseUrl: this.assetBaseUrl,
			skipFormatPreload: !!this.opts.skipFormatPreload,
			disablePreambleSnapshot: !!this.opts.disablePreambleSnapshot,
			persistentCache: !!this.opts.persistentCache,
			texliveVersion: this.opts.texliveVersion || "2025",
			...this.opts.warmupCache ? { warmupCache: this.opts.warmupCache } : {}
		};
		if (this.opts.texliveUrl && (r.texliveUrl = this.opts.texliveUrl), this.engine = new d(r), this.engine.onProgress = (e) => {
			this.engine.getStatus() === "loading" && this.setStatus("loading", `${e}%`);
		}, this.engine.onFileDownload = (e) => {
			this.setStatus(this.engine.getStatus(), `fetching ${e}`);
		}, this.opts.incremental && (this.incremental = new y(this.engine, { mainFile: this.mainFile })), this.opts.files) {
			this.fs = new w({ empty: !0 });
			for (let [e, t] of Object.entries(this.opts.files)) this.fs.writeFile(e, t);
		} else this.fs = new w();
		if (this.editorContainer = B(e, "editor container"), this.previewContainer = B(t, "preview container"), this.editorContainer === null) throw Error("Failed to initialize editor container.");
		if (this.previewContainer === null) throw Error("Failed to initialize preview container.");
		this.initComponents();
	}
	initComponents() {
		this.applyContainerBindings(), this.initViewer(), this.initScheduler(), this.initProjectModels(), this.initEditorState(), this.initBinaryPreview(), this.initEditorInteraction(), this.initRuntimeServices();
	}
	applyContainerBindings() {
		!this.editorContainer || !this.previewContainer || (this.runtimeScopeAttribute = this.opts.runtimeScopeAttribute?.trim() || this.runtimeScopeAttribute, this.editorContainer.setAttribute(this.runtimeScopeAttribute, ""), this.previewContainer.setAttribute(this.runtimeScopeAttribute, ""), this.opts.editorContainerClassName && this.editorContainer.classList.add(...this.opts.editorContainerClassName.split(/\s+/).filter(Boolean)), this.opts.previewContainerClassName && this.previewContainer.classList.add(...this.opts.previewContainerClassName.split(/\s+/).filter(Boolean)));
	}
	initViewer() {
		if (!this.previewContainer) throw Error("Preview container is not initialized.");
		this.pdfViewer = new F(this.previewContainer), this.pdfViewer.setInverseSearchHandler((e) => {
			this.revealLine(e.line, e.file);
		}), this.opts.toolbar === !1 && this.pdfViewer.setToolbarVisible(!1);
	}
	initScheduler() {
		this.scheduler = new h({
			isReady: () => this.engine.isReady(),
			compile: () => this.compileActiveEngine()
		}, (e) => this.onCompileResult(e), (e, t) => this.setStatus(e, t), {
			minDebounceMs: 50,
			maxDebounceMs: 1e3
		});
	}
	mainSource() {
		let e = this.fs.readFile(this.mainFile);
		return typeof e == "string" ? e : "";
	}
	unavailableEngine() {
		let e = _(this.mainSource(), this.opts.engine);
		return e.engine === "pdflatex" ? null : e;
	}
	async compileActiveEngine() {
		let e = this.unavailableEngine();
		if (e) return f(e);
		this.prebuildInFlight && await this.prebuildInFlight, this.compileInFlight = !0;
		try {
			let e = await this.tryFastPaint();
			if (e) return e;
			this.reconcileArmed = !1;
			let t = await this.engine.compile();
			return await this.attachCompletionSnapshot(t), this.incremental?.noteFull(this.mainSource(), this.projectStringFiles(), t.synctex), t;
		} finally {
			this.compileInFlight = !1;
		}
	}
	completionProfile() {
		let e = this.opts.texliveVersion ?? "2025", t = this.opts.resourceCatalog?.identity, n = this.opts.semanticCatalog?.identity, r = [t, n].filter((e) => e !== void 0);
		if (this.opts.completionProfile) {
			if (r.some((t) => t.texliveYear !== e || t.mirrorRevision !== this.opts.completionProfile.mirrorRevision)) throw Error("completionProfile does not match the selected completion catalogs");
			return {
				...this.opts.completionProfile,
				texliveYear: e
			};
		}
		if (t && n && (t.texliveYear !== n.texliveYear || t.mirrorRevision !== n.mirrorRevision)) throw Error("resource and semantic completion catalogs use different profiles");
		let i = t && n ? t : t ?? n ?? null;
		return {
			id: i ? `catalog:${i.mirrorRevision}` : `wasmtex:${e}:${this.opts.texliveUrl ?? "default-mirror"}`,
			texliveYear: e,
			mirrorRevision: i?.mirrorRevision ?? null
		};
	}
	async attachCompletionSnapshot(e) {
		if (!e.success || this.fs.getModifiedFiles().length > 0) return;
		let t = this.mainFile, n = this.fs.listFiles().filter((e) => !this.generatedFiles.has(e)).flatMap((e) => {
			let t = this.fs.getFile(e);
			return t ? [{
				path: t.path,
				content: typeof t.content == "string" ? t.content : Uint8Array.from(t.content)
			}] : [];
		}), i = this.engine.getCompletionObservation(), a = await r({
			engine: "pdflatex",
			root: t,
			profile: this.completionProfile(),
			projectFiles: n,
			...e.engineCommands ? { engineCommands: e.engineCommands } : {},
			engineCommandsComplete: e.engineCommandsComplete === !0,
			...e.engineCommandsDropped === void 0 ? {} : { engineCommandsDropped: e.engineCommandsDropped },
			...i ? { engineObservation: i } : {},
			...e.inputFiles ? { inputFiles: e.inputFiles } : {},
			inputFilesComplete: e.inputFilesComplete === !0
		});
		t !== this.mainFile || this.fs.getModifiedFiles().length > 0 || (e.telemetry ??= { diagnostics: l(e.log) }, e.telemetry.completionSnapshot = a);
	}
	async tryFastPaint() {
		let e = this.incremental;
		if (!e || this.reconcileArmed || this.pendingRecompile) return null;
		let t = this.editEpoch, n = this.mainSource(), r = this.projectStringFiles();
		if (!e.canFastServe(n, r)) return null;
		let i = await e.tryIncremental(n, r);
		return !i?.pdf || !i.final ? null : (this.editEpoch === t && (this.reconcileArmed = !0, this.pendingFastMerge = i.synctexData ?? null), this.fastCompileResult(i));
	}
	projectStringFiles() {
		let e = /* @__PURE__ */ new Map();
		for (let t of this.fs.listFiles()) {
			let n = this.fs.readFile(t);
			typeof n == "string" && e.set(t, n);
		}
		return e;
	}
	fastCompileResult(e) {
		return {
			success: e.success,
			pdf: e.pdf,
			log: e.log,
			errors: u(e.log),
			compileTime: 0,
			synctex: null,
			telemetry: { diagnostics: l(e.log) }
		};
	}
	armPrebuild() {
		this.incremental && (this.cancelPrebuild(), !(this.pendingBibtex || this.pendingRecompile || this.reconcileArmed) && (this.prebuildTimer = setTimeout(() => {
			this.prebuildTimer = null, this.runPrebuild();
		}, L)));
	}
	async runPrebuild() {
		let e = this.incremental;
		if (!e || this.prebuildInFlight || this.compileInFlight || this.pendingBibtex || this.pendingRecompile || this.reconcileArmed || this.engine.getStatus() !== "ready") return;
		let t = this.mainSource(), n = this.projectStringFiles(), r = this.cursorMainOffset();
		this.prebuildInFlight = e.prebuild(t, n, r).then(() => {}).catch(() => {});
		try {
			await this.prebuildInFlight;
		} finally {
			this.prebuildInFlight = null;
		}
	}
	cancelPrebuild() {
		this.prebuildTimer &&= (clearTimeout(this.prebuildTimer), null);
	}
	cursorMainOffset() {
		let e = this.mainSource();
		if (this.currentFile !== this.mainFile) return e.length;
		let t = this.models.get(this.mainFile), n = this.editor?.getPosition();
		if (!t || !n) return e.length;
		try {
			return t.getOffsetAt(n);
		} catch {
			return e.length;
		}
	}
	initProjectModels() {
		for (let e of this.fs.listFiles()) {
			let t = this.fs.getFile(e);
			t && typeof t.content == "string" && (this.ensureModel(e, t.content), e.endsWith(".tex") && this.updateProjectIndex(e, t.content));
		}
		this.updateBibIndex(), this.models.has(this.currentFile) || this.ensureModel(this.currentFile, "");
	}
	initEditorState() {
		let t = this.models.get(this.currentFile);
		if (!t) throw Error("Initial model is not available.");
		if (this.opts.editor) this.editor = this.opts.editor, this.switchingModel = !0, this.editor.setModel(t), this.switchingModel = !1;
		else {
			if (!this.editorContainer) throw Error("Editor container is not initialized.");
			this.editor = e(this.editorContainer, t);
		}
		let n = this.editor._codeEditorService;
		n && (this.openCodeEditorOverride = s(n, async (e, t, n, r) => {
			let i = e, a = await r(i, t, n);
			if (!a && i.resource) {
				let e = i.resource.toString();
				for (let [t, n] of this.models.entries()) if (n.uri.toString() === e) {
					if (this.onFileSelect(t), i.options?.selection) {
						let e = i.options.selection;
						this.editor.setSelection(e), this.editor.revealRangeInCenter(e);
					}
					return !0;
				}
			}
			return a;
		}));
	}
	initBinaryPreview() {
		this.previewEl = document.createElement("div"), this.previewEl.className = "binary-preview", this.previewEl.style.display = "none", this.editorContainer?.appendChild(this.previewEl), this.preview = new o(this.previewEl);
	}
	initEditorInteraction() {
		this.interactionDisposables.push(this.editor.onDidChangeModel(() => {
			let e = this.editor.getModel();
			if (!(this.switchingModel || !e)) {
				for (let [t, n] of this.models.entries()) if (n === e) {
					this.currentFile !== t && (this.currentFile = t, this.emit("fileOpen", { path: t }), this.emitOutline(), this.runDiagnostics());
					break;
				}
			}
		})), this.interactionDisposables.push(this.editor.onDidChangeCursorPosition(() => {
			if (this.switchingModel) return;
			let e = this.editor.getPosition();
			e && (this.emit("cursorChange", {
				path: this.currentFile,
				line: e.lineNumber,
				column: e.column
			}), (e.lineNumber !== this.lastForwardLine || this.currentFile !== this.lastForwardFile) && (this.lastForwardLine = e.lineNumber, this.lastForwardFile = this.currentFile, this.forwardSearchTimer && clearTimeout(this.forwardSearchTimer), this.forwardSearchTimer = setTimeout(() => {
				this.pdfViewer?.forwardSearch(this.currentFile, e.lineNumber);
			}, 100), this.armPrebuild()));
		})), this.interactionDisposables.push(this.editor.addAction({
			id: "latex.save-compile",
			label: "Save & Compile",
			keybindings: [2097],
			run: () => {
				this.syncAndCompile().then(() => this.scheduler.flush());
			}
		})), this.pdfViewer?.setDownloadHandler(() => this.downloadPdf());
	}
	updateProjectIndex(e, t) {
		this.projectIndex.updateFile(e, t), this.completionRegistry && k(this.completionRegistry, this.projectIndex);
	}
	initRuntimeServices() {
		this.completionRegistry = O({
			...this.opts.resourceCatalog ? { resourceCatalog: this.opts.resourceCatalog } : {},
			...this.opts.semanticCatalog ? { semanticCatalog: this.opts.semanticCatalog } : {}
		}), k(this.completionRegistry, this.projectIndex), this.lspDisposables = j(this.projectIndex, this.fs, (e) => this.emit("workspaceEdit", e), "latex", this.completionRegistry), this.perfOverlayDispose = p(), this.unhandledRejectionHandler = (e) => {
			(e.reason?.message === "Canceled" || e.reason === "You cannot rename this element.") && e.preventDefault();
		}, window.addEventListener("unhandledrejection", this.unhandledRejectionHandler), this.opts.serviceWorker !== !1 && "serviceWorker" in navigator && navigator.serviceWorker.register(`${this.assetBaseUrl}sw.js`).catch((e) => {
			console.warn("SW registration failed:", e);
		});
	}
	async init() {
		this.setStatus("loading");
		try {
			await this.engine.init(), await S(this.fs, this.engine, (e) => this.ensureEngineDirectories(e), this.mainFile), this.setStatus("compiling");
			let e = await this.compileActiveEngine();
			this.onCompileResult(e);
		} catch (e) {
			console.error("Engine initialization failed:", e), this.setStatus("error", String(e));
		}
	}
	loadProject(e) {
		let t = new Set(this.models.keys()), n = new Set(Object.keys(e));
		this.generatedFiles.clear();
		for (let e of this.fs.listFiles()) this.fs.deleteFile(e), this.projectIndex.removeFile(e);
		this.engine.flushCache(), this.bibtexEngine?.terminate(), this.bibtexEngine = null, this.pendingBibtex = !1, this.pendingRecompile = !1, this.reconcileArmed = !1, this.pendingFastMerge = null, this.cancelPendingRerun(), this.cancelPrebuild(), this.incremental?.reset(), this.bibtexRunId++, this.rerunController.reset(), this.updateModels(e, t, n), this.updateBibIndex(), this.bibtexDone = !1, this.hideBinaryPreview(), this.currentFile = this.mainFile, this.emit("fileOpen", { path: this.currentFile }), this.lastForwardLine = -1, this.lastForwardFile = "";
		let r = this.models.get(this.currentFile);
		r && this.editor && (this.switchingModel = !0, this.editor.setModel(r), this.switchingModel = !1), this.emit("filesUpdate", { files: this.fs.listFiles() }), this.emitOutline(), this.syncAndCompile();
	}
	updateModels(e, t, n) {
		for (let [t, n] of Object.entries(e)) if (this.fs.writeFile(t, n), typeof n == "string") {
			t.endsWith(".tex") && this.updateProjectIndex(t, n);
			let e = this.models.get(t);
			e ? this.opts.collaboration || e.setValue(n) : this.ensureModel(t, n);
		}
		for (let e of t) n.has(e) || this.disposeModel(e);
	}
	saveProject() {
		this.editor && this.fs.writeFile(this.currentFile, this.editor.getValue());
		let e = {};
		for (let t of this.fs.listFiles()) {
			let n = this.fs.getFile(t);
			n && (e[t] = n.content);
		}
		return e;
	}
	openFile(e) {
		this.onFileSelect(e);
	}
	setFile(e, t) {
		let n = !this.fs.getFile(e);
		if (this.projectIndex.invalidateCompletionSnapshot(), this.generatedFiles.delete(e), this.fs.writeFile(e, t), e.endsWith(".tex") || this.incremental?.reset(), typeof t == "string") {
			e.endsWith(".tex") && this.updateProjectIndex(e, t), e.endsWith(".bib") && this.updateBibIndex();
			let n = this.models.get(e);
			n ? this.opts.collaboration || n.setValue(t) : this.ensureModel(e, t);
		}
		this.emit("filechange", {
			path: e,
			content: t
		}), n && this.emit("filesUpdate", { files: this.fs.listFiles() }), e === this.currentFile && this.emitOutline();
	}
	getFile(e) {
		return this.fs.readFile(e);
	}
	deleteFile(e) {
		this.disposeModel(e), this.projectIndex.removeFile(e);
		let t = this.fs.deleteFile(e);
		return t && (this.generatedFiles.delete(e), this.incremental?.reset(), this.reconcileArmed = !1, this.pendingFastMerge = null, this.cancelPrebuild(), e.endsWith(".bib") && this.updateBibIndex(), this.engine.flushCache(), this.fs.markAllModified(), this.emit("filesUpdate", { files: this.fs.listFiles() }), this.currentFile === e && this.openFile(this.mainFile), this.syncAndCompile()), t;
	}
	createFolder(e) {
		let t = e.replace(/\/+$/, "");
		this.setFile(`${t}/.gitkeep`, "");
	}
	listFiles() {
		return this.fs.listFiles();
	}
	async clearCache() {
		await this.engine.clearCache();
	}
	compile() {
		this.syncAndCompile().then(() => this.scheduler.flush());
	}
	getPdf() {
		return this.pdfViewer?.getLastPdf() ?? null;
	}
	getCompletionSnapshotState() {
		return this.projectIndex.getCompletionSnapshotState();
	}
	on(e, t) {
		let n = this.listeners.get(e);
		n || (n = /* @__PURE__ */ new Set(), this.listeners.set(e, n)), n.add(t);
	}
	off(e, t) {
		this.listeners.get(e)?.delete(t);
	}
	getMonacoEditor() {
		return this.editor;
	}
	getModel(e) {
		return this.models.get(e);
	}
	getViewer() {
		return this.pdfViewer;
	}
	getActiveFile() {
		return this.currentFile;
	}
	revealLine(e, t) {
		t && t !== this.currentFile ? (this.openFile(t), requestAnimationFrame(() => n(this.editor, e))) : n(this.editor, e);
	}
	cancelForwardSearch() {
		this.forwardSearchTimer &&= (clearTimeout(this.forwardSearchTimer), null);
	}
	dispose() {
		if (!this.disposed) {
			this.disposed = !0, this.scheduler.cancel(), this.cancelForwardSearch(), this.revokePreviewUrl(), this.cancelPendingRerun(), this.cancelPrebuild(), this.unhandledRejectionHandler &&= (window.removeEventListener("unhandledrejection", this.unhandledRejectionHandler), null);
			for (let e of this.lspDisposables) e.dispose();
			this.lspDisposables = [], this.completionRegistry = void 0;
			for (let e of this.interactionDisposables) e.dispose();
			this.interactionDisposables = [], this.openCodeEditorOverride?.dispose(), this.openCodeEditorOverride = null, this.externalEditor || this.editor?.dispose();
			for (let e of this.modelDisposables.values()) e.dispose();
			this.modelDisposables.clear();
			for (let e of this.models.values()) e.dispose();
			this.models.clear(), this.perfOverlayDispose?.(), this.perfOverlayDispose = void 0, this.pdfViewer?.destroy(), this.engine.terminate(), this.bibtexEngine?.terminate(), this.listeners.clear();
		}
	}
	ensureModel(e, n) {
		let r = this.models.get(e);
		if (!r) {
			r = t(n, e, !this.opts.collaboration), this.models.set(e, r);
			let i = r.onDidChangeContent(() => {
				this.onModelChange(e, r.getValue());
			});
			this.modelDisposables.set(e, i), this.emit("modelCreate", {
				path: e,
				model: r
			});
		}
		return r;
	}
	disposeModel(e) {
		let t = this.models.get(e);
		t && (this.emit("modelDispose", { path: e }), this.modelDisposables.get(e)?.dispose(), this.modelDisposables.delete(e), t.dispose(), this.models.delete(e));
	}
	setStatus(e, t, n) {
		if (this.pdfViewer) {
			let n = {
				unloaded: "Initializing...",
				loading: "Loading engine...",
				ready: "Ready",
				compiling: "Compiling...",
				error: "Error",
				rendering: "Rendering PDF..."
			}, r = t ? `${n[e]} ${t}` : n[e];
			this.pdfViewer.setLoadingStatus(r);
		}
		let r = { status: e };
		t !== void 0 && (r.message = t), n?.preambleSnapshot && (r.preambleSnapshot = !0), n?.incremental && (r.incremental = !0), this.emit("status", r);
	}
	async syncAndCompile() {
		let e = this.engine.getStatus();
		if (e === "unloaded" || e === "loading" || e === "error") return;
		let t = this.fs.getModifiedFiles();
		await this.ensureEngineDirectories(t.map((e) => e.path));
		for (let e of t) await this.engine.writeFile(e.path, e.content);
		this.fs.markSynced(t), this.engine.setMainFile(this.mainFile), this.scheduler.schedule();
	}
	async ensureEngineDirectories(e) {
		let t = /* @__PURE__ */ new Set();
		for (let n of e) {
			let e = n.split("/"), r = "";
			for (let n = 0; n < e.length - 1; n++) r = r ? `${r}/${e[n]}` : e[n], t.add(r);
		}
		for (let e of Array.from(t).sort()) await this.engine.mkdir(e);
	}
	onModelChange(e, t) {
		this.preview?.shouldSuppressModelChange(e, this.currentFile) || (m.mark("total"), m.mark("debounce"), this.bibtexDone = !1, this.bibtexRunId++, this.pendingBibtex = !1, this.pendingRecompile = !1, this.editEpoch++, this.reconcileArmed = !1, this.pendingFastMerge = null, this.cancelPendingRerun(), this.cancelPrebuild(), this.rerunController.reset(), e.endsWith(".tex") || this.incremental?.reset(), this.projectIndex.invalidateCompletionSnapshot(), this.generatedFiles.delete(e), this.fs.writeFile(e, t), e.endsWith(".tex") && this.updateProjectIndex(e, t), e.endsWith(".bib") && this.updateBibIndex(), e === this.currentFile && this.emitOutline(), this.runDiagnostics(), this.emit("filechange", {
			path: e,
			content: t
		}), this.syncAndCompile());
	}
	onFileSelect(e) {
		let t = this.fs.getFile(e);
		if (!t) return;
		let n = this.preview?.isVisible() ?? !1;
		if (this.editor && !n) {
			let e = this.editor.getValue();
			C(this.fs, this.currentFile, e) && this.currentFile.endsWith(".tex") && this.updateProjectIndex(this.currentFile, e);
		}
		if (this.currentFile = e, this.emit("fileOpen", { path: e }), this.lastForwardLine = -1, this.lastForwardFile = "", this.cancelForwardSearch(), t.content instanceof Uint8Array) {
			this.showBinaryPreview(e, t.content);
			return;
		}
		this.hideBinaryPreview(), typeof t.content == "string" && !this.models.has(e) && this.ensureModel(e, t.content);
		let r = this.models.get(e);
		r && this.editor && (this.switchingModel = !0, this.editor.setModel(r), this.switchingModel = !1), this.emitOutline(), this.runDiagnostics();
	}
	revokePreviewUrl() {
		this.previewUrl &&= (URL.revokeObjectURL(this.previewUrl), null);
	}
	showBinaryPreview(e, t) {
		if (this.previewEl) {
			if (this.revokePreviewUrl(), this.previewEl.innerHTML = "", R(e)) {
				let e = a(t), n = URL.createObjectURL(e);
				this.previewUrl = n;
				let r = document.createElement("img");
				r.src = n, r.className = "binary-preview-img";
				let i = () => {
					URL.revokeObjectURL(n), this.previewUrl === n && (this.previewUrl = null);
				};
				r.onload = i, r.onerror = i, this.previewEl.appendChild(r);
			} else {
				let n = document.createElement("div");
				n.className = "binary-preview-info", n.textContent = `${e.substring(e.lastIndexOf(".")).toUpperCase()} file \u2014 ${z(t.length)}`, this.previewEl.appendChild(n);
			}
			this.preview?.show();
		}
	}
	hideBinaryPreview() {
		this.revokePreviewUrl(), this.preview?.hide();
	}
	updateEngineMetadata(e) {
		e.semanticTrace ? this.projectIndex.updateSemanticTrace(M(e.semanticTrace)) : this.projectIndex.updateSemanticTrace({
			labels: /* @__PURE__ */ new Set(),
			refs: /* @__PURE__ */ new Set()
		}), e.inputFiles?.length && this.updateRecordedInputMetadata(e.inputFiles);
		let t = e.telemetry?.completionSnapshot;
		t ? this.projectIndex.updateCompletionSnapshot(t) : e.engineCommands?.length && this.projectIndex.getCompletionSnapshotStatus() === "absent" && this.projectIndex.updateEngineCommands(e.engineCommands);
	}
	updateRecordedInputMetadata(e) {
		for (let t of e) {
			let e = g(t);
			if (!e || this.projectIndex.getFileSymbols(e)) continue;
			let n = this.fs.getFile(e);
			!n || typeof n.content != "string" || (this.updateProjectIndex(e, n.content), this.ensureModel(e, n.content));
		}
	}
	onCompileResult(e) {
		m.end("compile");
		let t = this.reconcileArmed, n = ++this.renderSeq, r = { preambleSnapshot: !!e.preambleSnapshot };
		this.updateEngineMetadata(e), e.format && this.downloadFormat(e.format), e.success && e.pdf ? this.handleSuccessfulCompile(e, r, n, t) : (m.end("total"), console.error("[engine] compilation failed. memlog:", e.log), this.setStatus(e.errors.length > 0 ? "error" : "ready", void 0, r)), this.handlePostCompile(e, t);
	}
	handleSuccessfulCompile(e, t, n, r = !1) {
		r && (t = {
			...t,
			incremental: !0
		});
		let i = [];
		for (let e of this.fs.listFiles()) {
			let t = this.fs.getFile(e);
			t && typeof t.content == "string" && i.push([e, t.content]);
		}
		this.pdfViewer?.setSources(i), r || this.handleSynctex(e, n), this.pdfViewer ? (this.setStatus("rendering"), m.mark("render"), this.pdfViewer.render(e.pdf).then(() => {
			m.end("render"), m.end("total"), n === this.renderSeq && this.setStatus("ready", void 0, t);
		}).catch((e) => {
			m.end("render"), m.end("total"), n === this.renderSeq && (console.error("PDF render failed:", e), this.setStatus("error", "Failed to display PDF"));
		})) : (m.end("total"), this.setStatus("ready", void 0, t));
	}
	handlePostCompile(e, t = !1) {
		if (t) {
			let t = this.pendingFastMerge;
			this.pendingFastMerge = null, this.emitOutline(), this.runDiagnostics(), this.emit("compile", { result: e }), this.applyFastSynctex(t);
			return;
		}
		P(e.errors, this.models.values()), this.updateAuxIndex(), this.emitOutline(), this.runDiagnostics(), this.pendingBibtex || this.maybeRunBibtex(e), this.pendingBibtex || this.maybeRecompile(e), this.emit("compile", { result: e }), this.armPrebuild();
	}
	applyFastSynctex(e) {
		e ? (this.pdfViewer?.setSynctexData(e), this.reconcileArmed = !1) : this.scheduler.schedule();
	}
	handleSynctex(e, t) {
		e.synctex ? (m.mark("synctex-parse"), this.synctexParser.parse(e.synctex).then((e) => {
			m.end("synctex-parse"), t === this.renderSeq && this.pdfViewer?.setSynctexData(e);
		}).catch((e) => {
			m.end("synctex-parse"), console.warn("SyncTeX parse failed, using text-mapper fallback:", e), t === this.renderSeq && this.pdfViewer?.setSynctexData(null);
		})) : this.pdfViewer?.setSynctexData(null);
	}
	cancelPendingRerun() {
		this.rerunTimer &&= (clearTimeout(this.rerunTimer), null);
	}
	maybeRecompile(e) {
		if (this.pendingRecompile || !(e.success || e.pdf)) {
			this.pendingRecompile = !1;
			return;
		}
		let t = x(e.semanticTrace ?? e.log), n = this.rerunController.decide(e.log || "", t);
		if (n.rerun) {
			console.log("[main] Log indicates references changed. Triggering automated rerun..."), this.pendingRecompile = !0, this.rerunTimer = setTimeout(() => {
				this.compileActiveEngine().then((e) => {
					this.pendingRecompile = !1, this.onCompileResult(e), this.syncAndCompile();
				}).catch((e) => {
					this.pendingRecompile = !1, e instanceof Error && e.name === "AbortError" || console.error("[main] Automated rerun failed:", e);
				});
			}, 100);
			return;
		}
		this.pendingRecompile = !1, n.stopped === "limit" ? (console.warn("[main] Rerun limit reached; cross-references may be stale."), this.setStatus("ready", "cross-references may be stale (rerun limit reached)")) : n.stopped === "no-progress" && (console.warn("[main] Reruns did not converge; stopping."), this.setStatus("ready", "cross-references did not converge"));
	}
	maybeRunBibtex(e) {
		if (this.pendingRecompile || this.pendingBibtex || this.bibtexDone || !e.success && !e.pdf || !this.fs.listFiles().some((e) => e.endsWith(".bib"))) return;
		console.log("[main] Triggering BibTeX run..."), this.pendingBibtex = !0;
		let t = ++this.bibtexRunId;
		this.runBibtexChain(t).catch((e) => {
			console.warn("BibTeX chain error:", e);
		}).finally(() => {
			this.bibtexRunId === t && (this.pendingBibtex = !1);
		});
	}
	isCurrentBibtexRun(e) {
		return this.bibtexRunId === e;
	}
	async runBibtexChain(e) {
		let t = this.mainFile.replace(/\.tex$/, ""), n = await this.engine.readFile(`${t}.aux`);
		if (!this.isCurrentBibtexRun(e) || !n || !n.includes("\\citation{") || !n.includes("\\bibdata{")) return;
		this.setStatus("compiling", "Running BibTeX...");
		let r = await this.ensureBibtexEngine();
		if (!this.isCurrentBibtexRun(e) || !r || (await this.sendFilesToBibtex(r, t, n), !this.isCurrentBibtexRun(e)) || (await r.compile(t), !this.isCurrentBibtexRun(e))) return;
		let i = await r.readFile(`${t}.bbl`);
		if (!this.isCurrentBibtexRun(e)) return;
		if (!i) {
			console.warn("[main] BibTeX finished but no .bbl was produced."), this.setStatus("error", "BibTeX did not produce a .bbl file.");
			return;
		}
		if (this.bibtexDone = !0, console.log(`[main] BibTeX produced .bbl (${i.length} bytes). Writing back to engine...`), await this.engine.writeFile(`${t}.bbl`, i), !this.isCurrentBibtexRun(e)) return;
		this.projectIndex.invalidateCompletionSnapshot(), this.fs.writeFile(`${t}.bbl`, i), this.generatedFiles.add(`${t}.bbl`), this.emit("filesUpdate", { files: this.fs.listFiles() }), this.pendingRecompile = !0;
		let a = await this.engine.compile().finally(() => {
			this.pendingRecompile = !1;
		});
		this.isCurrentBibtexRun(e) && (await this.attachCompletionSnapshot(a), this.onCompileResult(a), await this.syncAndCompile());
	}
	async ensureBibtexEngine() {
		if (this.bibtexEngine) return this.bibtexEngine;
		let e = {
			assetBaseUrl: this.assetBaseUrl,
			texliveVersion: this.opts.texliveVersion || "2025"
		};
		this.opts.texliveUrl && (e.texliveUrl = this.opts.texliveUrl), this.bibtexEngine = new c(e), this.bibtexEngine.onFileDownload = (e) => {
			this.setStatus("compiling", `fetching ${e}`);
		};
		try {
			return await this.bibtexEngine.init(), this.bibtexEngine;
		} catch (e) {
			return console.warn("BibTeX engine init failed:", e), this.bibtexEngine = null, null;
		}
	}
	async sendFilesToBibtex(e, t, n) {
		await e.writeFile(`${t}.aux`, n);
		let r = this.fs.listFiles().filter((e) => e.endsWith(".bib"));
		for (let t of r) {
			let n = this.fs.readFile(t);
			n != null && await e.writeFile(t, n);
		}
		let i = n.match(/\\bibstyle\{([^}]+)\}/);
		if (!i) return;
		let a = i[1], o = a.endsWith(".bst") ? a : `${a}.bst`, s = this.fs.readFile(o);
		s != null && e.writeFile(o, s);
	}
	updateBibIndex() {
		E(this.fs, this.projectIndex);
	}
	updateAuxIndex() {
		let e = this.mainFile.replace(/\.tex$/, "");
		this.engine.readFile(`${e}.aux`).then((e) => {
			if (!e) return;
			let t = T(e), n = t.includes.map((e) => this.engine.readFile(e).then((e) => e ? T(e) : null));
			Promise.all(n).then((e) => {
				for (let n of e) if (n) {
					for (let [e, r] of n.labels) t.labels.set(e, r);
					for (let e of n.citations) t.citations.add(e);
				}
				this.projectIndex.updateAuxData(t), this.runDiagnostics();
			});
		}).catch(() => {});
	}
	runDiagnostics() {
		let e = D(this.projectIndex), t = this.opts.lint ?? !0;
		if (t !== !1) {
			let n = t === !0 ? void 0 : t;
			for (let t of this.fs.listFiles()) {
				if (!t.endsWith(".tex")) continue;
				let r = this.fs.getFile(t);
				r && typeof r.content == "string" && e.push(...i(r.content, t, n));
			}
		}
		N(e, this.models.values()), this.emit("diagnostics", { diagnostics: e });
	}
	downloadPdf() {
		let e = this.pdfViewer?.getLastPdf();
		if (!e) return;
		let t = new Blob([e.buffer], { type: "application/pdf" }), n = URL.createObjectURL(t), r = document.createElement("a");
		r.href = n, r.download = "output.pdf", r.click(), URL.revokeObjectURL(n);
	}
	downloadFormat(e) {
		let t = new Blob([e.buffer], { type: "application/octet-stream" }), n = URL.createObjectURL(t), r = document.createElement("a");
		r.href = n, r.download = "wasmtex-pdftex.fmt", r.click(), URL.revokeObjectURL(n);
	}
	emitOutline() {
		let e = this.projectIndex.getFileSymbols(this.currentFile);
		this.emit("outlineUpdate", { sections: e?.sections ?? [] });
	}
	emit(e, t) {
		let n = this.listeners.get(e);
		if (n) for (let e of n) e(t);
	}
};
//#endregion
export { H as WasmTex };
