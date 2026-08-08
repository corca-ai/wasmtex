import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as e, COMPLETION_SNAPSHOT_SCHEMA_VERSION as t, boundCompletionSnapshot as n, completionProjectRevision as r } from "./engine/completion-snapshot.js";
import { DEFAULT_LINT_CONFIG as i, lintSource as a } from "./lsp/linter.js";
import { formatSignature as o, getCommandPackage as s, getCommandSignature as c, getEnvironmentSignature as l, parseSignature as u, registerShard as d } from "./lsp/package-db.js";
import { PackageShardLoader as f } from "./lsp/package-shard-loader.js";
import { VirtualFS as p } from "./fs/virtual-fs.js";
import { parseAuxFile as m } from "./lsp/aux-parser.js";
import { parseBibFileData as h } from "./lsp/bib-parser.js";
import { computeDiagnostics as g } from "./lsp/diagnostic-provider.js";
import { analyzeCompletionContext as _ } from "./lsp/completion-context.js";
import { CompletionResolverRegistry as v } from "./lsp/completion-registry.js";
import { HttpTexSemanticCatalogProvider as y, InMemoryTexSemanticCatalogProvider as b, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION as x, registerTexSemanticShard as S } from "./lsp/semantic-catalog.js";
import { createDefaultCompletionRegistry as C, preloadSemanticCatalog as w, provideCompletionResult as T, provideCompletionResultAsync as E, provideDefinition as D, provideHover as O, provideReferences as k } from "./lsp/neutral-providers.js";
import { getCodeActions as A, getDocumentHighlights as j, getDocumentLinks as M, getFoldingRanges as N, getInlayHints as P, getSemanticTokens as F, getSignatureHelp as I, getWorkspaceSymbols as L } from "./lsp/language-features.js";
import { parseTraceFile as R } from "./lsp/trace-parser.js";
import { IncrementalLinter as z } from "./lsp/incremental-linter.js";
import { LatexSyntaxService as B } from "./syntax.js";
import { HttpTexResourceCatalogProvider as V, InMemoryTexResourceCatalogProvider as H, TEX_RESOURCE_CATALOG_SCHEMA_VERSION as U } from "./lsp/resource-catalog.js";
//#region src/lsp-service.ts
function W(e) {
	return /\.(?:tex|sty|cls|ltx)$/i.test(e);
}
var G = class {
	fs = new p({ empty: !0 });
	index;
	syntaxService;
	documentPaths = /* @__PURE__ */ new Map();
	documentIds = /* @__PURE__ */ new Map();
	documentVersions = /* @__PURE__ */ new Map();
	documentLanguages = /* @__PURE__ */ new Map();
	lint;
	linter;
	completionRegistry;
	resourceCatalog;
	semanticCatalog;
	mainFile;
	completionProfile;
	projectRevisionEpoch = 0;
	completionSnapshotUpdate = 0;
	constructor(e = {}) {
		this.syntaxService = e.syntaxService ?? new B(), this.index = this.syntaxService.getProjectIndex(), this.lint = e.lint ?? !0, this.linter = new z(this.lint), this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.mainFile = e.mainFile ?? "main.tex", this.completionProfile = e.completionProfile, this.completionRegistry = e.completionRegistry ?? C({
			...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
			...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
		}), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
	}
	loadProject(e) {
		this.projectRevisionEpoch++, this.fs = new p({ empty: !0 }), this.syntaxService.reset({ documents: [] }), this.index = this.syntaxService.getProjectIndex(), this.documentPaths.clear(), this.documentIds.clear(), this.documentVersions.clear(), this.documentLanguages.clear(), this.linter = new z(this.lint);
		for (let [t, n] of Object.entries(e)) this.updateFile(t, n);
	}
	updateFile(e, t) {
		if (this.fs.readFile(e) !== t) {
			if (this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot(), this.fs.writeFile(e, t), this.linter.updateFile(e, t), typeof t != "string") {
				let t = this.documentIds.get(e);
				t && this.removeSyntaxDocument(t), e.toLowerCase().endsWith(".bib") && this.index.removeBibFile(e);
				return;
			}
			if (W(e)) {
				let n = this.documentIds.get(e) ?? `path:${e}`, r = (this.documentVersions.get(n) ?? 0) + 1;
				this.upsertSyntaxDocument({
					fileId: n,
					path: e,
					content: t,
					documentVersion: r,
					language: "latex"
				});
			} else if (/\.md$/i.test(e)) {
				let n = this.documentIds.get(e) ?? `path:${e}`, r = (this.documentVersions.get(n) ?? 0) + 1;
				this.upsertSyntaxDocument({
					fileId: n,
					path: e,
					content: t,
					documentVersion: r,
					language: "markdown"
				});
			}
			e.toLowerCase().endsWith(".bib") && this.index.updateBibFile(e, h(t, e));
		}
	}
	removeFile(e) {
		let t = this.fs.deleteFile(e);
		if (!t) return !1;
		this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot(), this.linter.removeFile(e);
		let n = this.documentIds.get(e);
		return n && this.removeSyntaxDocument(n), e.toLowerCase().endsWith(".bib") && this.index.removeBibFile(e), t;
	}
	updateDocument(e) {
		let t = this.documentPaths.get(e.fileId);
		t && t !== e.path && (this.fs.deleteFile(t), this.linter.removeFile(t), this.documentIds.delete(t));
		let n = this.documentIds.get(e.path);
		n && n !== e.fileId && this.removeSyntaxDocument(n);
		let r = this.fs.readFile(e.path), i = this.documentVersions.get(e.fileId);
		if (r === e.content && i === e.documentVersion) {
			let t = this.syntaxService.getFile(e.fileId);
			if (t) return t;
		}
		return this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot(), this.fs.writeFile(e.path, e.content), this.linter.updateFile(e.path, e.content), this.upsertSyntaxDocument(e);
	}
	moveDocument(e, t) {
		let n = this.documentPaths.get(e);
		if (!n) throw Error(`unknown fileId: ${e}`);
		let r = this.fs.readFile(n);
		return this.updateDocument({
			fileId: e,
			path: t,
			content: r,
			documentVersion: this.documentVersions.get(e),
			language: this.documentLanguages.get(e)
		});
	}
	removeDocument(e) {
		let t = this.documentPaths.get(e);
		if (!t) return !1;
		let n = this.fs.deleteFile(t);
		return this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot(), this.linter.removeFile(t), this.removeSyntaxDocument(e), n;
	}
	getSyntaxService() {
		return this.syntaxService;
	}
	getFile(e) {
		return this.fs.readFile(e);
	}
	upsertSyntaxDocument(e) {
		let t = this.syntaxService.upsert(e);
		return this.documentPaths.set(e.fileId, e.path), this.documentIds.set(e.path, e.fileId), this.documentVersions.set(e.fileId, e.documentVersion), this.documentLanguages.set(e.fileId, e.language ?? "latex"), e.language !== "markdown" && w(this.completionRegistry, this.index), t;
	}
	removeSyntaxDocument(e) {
		let t = this.documentPaths.get(e);
		this.syntaxService.remove(e), this.documentPaths.delete(e), this.documentVersions.delete(e), this.documentLanguages.delete(e), t && this.documentIds.delete(t);
	}
	listFiles() {
		return this.fs.listFiles();
	}
	setMainFile(e) {
		if (!e.trim()) throw Error("main file path must not be empty");
		e !== this.mainFile && (this.mainFile = e, this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot());
	}
	configureCompletion(e) {
		this.completionSnapshotUpdate++, this.completionProfile = e.completionProfile, this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.completionRegistry = e.completionRegistry ?? C({
			...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
			...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
		}), this.index.clearCompletionSnapshot(), w(this.completionRegistry, this.index);
	}
	updateAux(e) {
		this.index.updateAuxData(m(e));
	}
	updateEngineCommands(e) {
		this.index.updateEngineCommands(e);
	}
	updateSemanticTrace(e) {
		this.index.updateSemanticTrace(typeof e == "string" ? R(e) : e);
	}
	async updateCompletionSnapshot(e) {
		let t = n(e);
		this.assertCompletionProfile(t);
		let i = ++this.completionSnapshotUpdate, a = this.projectRevisionEpoch, o = this.fs.listFiles().flatMap((e) => {
			let t = this.fs.readFile(e);
			return t === null ? [] : [{
				path: e,
				content: typeof t == "string" ? t : Uint8Array.from(t)
			}];
		}), s = await r(o), c = a === this.projectRevisionEpoch && t.identity.projectRevision === s && t.identity.root === this.mainFile && this.fs.readFile(this.mainFile) !== null;
		return i === this.completionSnapshotUpdate ? (this.index.updateCompletionSnapshot(t), c || this.index.invalidateCompletionSnapshot(), this.index.getCompletionSnapshotState()) : this.index.getCompletionSnapshotState();
	}
	getCompletionSnapshotState() {
		return this.index.getCompletionSnapshotState();
	}
	clearCompletionSnapshot() {
		this.completionSnapshotUpdate++, this.index.clearCompletionSnapshot();
	}
	assertCompletionProfile(e) {
		let t = e.identity.profile, n = this.completionProfile;
		if (n && (n.id !== t.id || n.texliveYear !== t.texliveYear || n.mirrorRevision !== t.mirrorRevision)) throw Error("completion snapshot does not match the selected completion profile");
		for (let e of [this.resourceCatalog?.identity, this.semanticCatalog?.identity]) if (e && (e.texliveYear !== t.texliveYear || e.mirrorRevision !== t.mirrorRevision)) throw Error("completion snapshot does not match the selected catalog profile");
	}
	getDiagnostics() {
		let e = g(this.index);
		return e.push(...this.linter.diagnostics(this.fs.listFiles())), e;
	}
	getFileSymbols(e) {
		return this.index.getFileSymbols(e);
	}
	getOutline(e) {
		return this.index.getFileSymbols(e)?.sections ?? [];
	}
	textOf(e) {
		let t = this.fs.readFile(e);
		return typeof t == "string" ? t : "";
	}
	getSignatureHelp(e, t, n) {
		return I(this.textOf(e), t, n);
	}
	getFoldingRanges(e) {
		return N(this.textOf(e));
	}
	getDocumentHighlights(e, t, n) {
		return j(e, t, n, this.index);
	}
	getWorkspaceSymbols(e) {
		return L(e, this.index);
	}
	getInlayHints(e) {
		return P(this.textOf(e), this.index);
	}
	getDocumentLinks(e) {
		return M(this.textOf(e));
	}
	getSemanticTokens(e) {
		return F(this.textOf(e));
	}
	getCodeActions(e, t) {
		return A(this.textOf(e), e, t, this.index);
	}
	docFor(e) {
		let t = this.textOf(e), n = t.split("\n");
		return {
			path: e,
			getText: () => t,
			lineAt: (e) => n[e - 1] ?? ""
		};
	}
	getCompletionContext(e, t, n) {
		return _(this.docFor(e), {
			line: t,
			column: n
		}, this.completionRegistry);
	}
	getCompletions(e, t, n, r) {
		return this.getCompletionResult(e, t, n, r).items;
	}
	getCompletionResult(e, t, n, r) {
		return T(this.docFor(e), {
			line: t,
			column: n
		}, this.index, this.fs, {
			registry: this.completionRegistry,
			...r ? { cancellationToken: r } : {}
		});
	}
	getCompletionResultAsync(e, t, n, r) {
		return E(this.docFor(e), {
			line: t,
			column: n
		}, this.index, this.fs, {
			registry: this.completionRegistry,
			...r ? { cancellationToken: r } : {}
		});
	}
	getHover(e, t, n) {
		return O(this.docFor(e), {
			line: t,
			column: n
		}, this.index);
	}
	getDefinition(e, t, n) {
		return D(this.docFor(e), {
			line: t,
			column: n
		}, this.index);
	}
	getReferences(e, t, n) {
		return k(this.docFor(e), {
			line: t,
			column: n
		}, this.index);
	}
	getRenameEdits(e, t, n, r) {
		let i = this.index.findSymbolAt(e, t, n);
		if (i) return { edits: this.index.findAllOccurrences(i.name, i.type).map((e) => ({
			file: e.filePath,
			range: {
				startLineNumber: e.line,
				startColumn: e.column,
				endLineNumber: e.line,
				endColumn: e.column + e.length
			},
			newText: r
		})) };
	}
	getProjectIndex() {
		return this.index;
	}
	getVirtualFileSystem() {
		return this.fs;
	}
	getCompletionRegistry() {
		return this.completionRegistry;
	}
	getResourceCatalogState(e) {
		return this.resourceCatalog?.getState(e) ?? null;
	}
	loadResourceCatalog(e, t) {
		return this.resourceCatalog?.load(e, t) ?? null;
	}
	getSemanticCatalogState(e) {
		return this.semanticCatalog?.getState(e) ?? null;
	}
	loadSemanticCatalog(e, t) {
		return this.semanticCatalog?.load(e, t) ?? null;
	}
};
function K(e) {
	return new G(e);
}
//#endregion
export { e as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, t as COMPLETION_SNAPSHOT_SCHEMA_VERSION, v as CompletionResolverRegistry, i as DEFAULT_LINT_CONFIG, V as HttpTexResourceCatalogProvider, y as HttpTexSemanticCatalogProvider, H as InMemoryTexResourceCatalogProvider, b as InMemoryTexSemanticCatalogProvider, G as LatexLanguageService, f as PackageShardLoader, U as TEX_RESOURCE_CATALOG_SCHEMA_VERSION, x as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION, _ as analyzeCompletionContext, C as createDefaultCompletionRegistry, K as createLatexLanguageService, o as formatSignature, s as getCommandPackage, c as getCommandSignature, l as getEnvironmentSignature, a as lintSource, u as parseSignature, w as preloadSemanticCatalog, d as registerShard, S as registerTexSemanticShard };
