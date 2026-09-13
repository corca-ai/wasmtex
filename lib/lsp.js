import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as e, COMPLETION_SNAPSHOT_SCHEMA_VERSION as t, CompletionSnapshotValidationError as n, boundCompletionSnapshot as r, completionProjectRevision as i } from "./engine/completion-snapshot.js";
import { DEFAULT_LINT_CONFIG as a, lintSource as o } from "./lsp/linter.js";
import { formatSignature as s, getCommandPackage as c, getCommandSignature as l, getEnvironmentSignature as u, parseSignature as d, registerShard as f } from "./lsp/package-db.js";
import { PackageShardLoader as p } from "./lsp/package-shard-loader.js";
import { VirtualFS as m } from "./fs/virtual-fs.js";
import { parseAuxFile as h } from "./lsp/aux-parser.js";
import { parseAuxFiles as g, readAuxFiles as _ } from "./lsp/aux-files.js";
import { parseBibFileData as v } from "./lsp/bib-parser.js";
import { computeDiagnostics as y } from "./lsp/diagnostic-provider.js";
import { analyzeCompletionContext as b } from "./lsp/completion-context.js";
import { CompletionResolverRegistry as x } from "./lsp/completion-registry.js";
import { projectCommandMetadata as S } from "./lsp/project-command-metadata.js";
import { HttpTexSemanticCatalogProvider as C, InMemoryTexSemanticCatalogProvider as w, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION as T, registerTexSemanticShard as E } from "./lsp/semantic-catalog.js";
import { createDefaultCompletionRegistry as D, preloadSemanticCatalog as O, provideCompletionResult as k, provideCompletionResultAsync as A, provideDefinition as j, provideHover as M, provideReferences as N } from "./lsp/neutral-providers.js";
import { getCodeActions as P, getDocumentHighlights as F, getDocumentLinks as I, getFoldingRanges as L, getInlayHints as R, getSemanticTokens as z, getSignatureHelp as B, getWorkspaceSymbols as V } from "./lsp/language-features.js";
import { parseTraceFile as H } from "./lsp/trace-parser.js";
import { IncrementalLinter as U } from "./lsp/incremental-linter.js";
import { LatexSyntaxService as W } from "./syntax.js";
import { HttpTexResourceCatalogProvider as G, InMemoryTexResourceCatalogProvider as K, TEX_RESOURCE_CATALOG_SCHEMA_VERSION as q } from "./lsp/resource-catalog.js";
//#region src/lsp-service.ts
function J(e) {
	return /\.(?:tex|sty|cls|ltx)$/i.test(e);
}
var Y = class {
	fs = new m({ empty: !0 });
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
		this.syntaxService = e.syntaxService ?? new W(), this.index = this.syntaxService.getProjectIndex(), this.lint = e.lint ?? !0, this.linter = new U(this.lint), this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.mainFile = e.mainFile ?? "main.tex", this.completionProfile = e.completionProfile, this.completionRegistry = e.completionRegistry ?? D({
			...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
			...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
		}), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
	}
	loadProject(e) {
		this.projectRevisionEpoch++, this.fs = new m({ empty: !0 }), this.syntaxService.reset({ documents: [] }), this.index = this.syntaxService.getProjectIndex(), this.documentPaths.clear(), this.documentIds.clear(), this.documentVersions.clear(), this.documentLanguages.clear(), this.linter = new U(this.lint);
		for (let [t, n] of Object.entries(e)) this.updateFile(t, n);
	}
	updateFile(e, t) {
		if (this.fs.readFile(e) !== t) {
			if (this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot(), this.fs.writeFile(e, t), this.linter.updateFile(e, t), typeof t != "string") {
				let t = this.documentIds.get(e);
				t && this.removeSyntaxDocument(t), e.toLowerCase().endsWith(".bib") && this.index.removeBibFile(e);
				return;
			}
			if (J(e)) {
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
			e.toLowerCase().endsWith(".bib") && this.index.updateBibFile(e, v(t, e));
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
		return this.documentPaths.set(e.fileId, e.path), this.documentIds.set(e.path, e.fileId), this.documentVersions.set(e.fileId, e.documentVersion), this.documentLanguages.set(e.fileId, e.language ?? "latex"), e.language !== "markdown" && O(this.completionRegistry, this.index), t;
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
		this.completionSnapshotUpdate++, this.completionProfile = e.completionProfile, this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.completionRegistry = e.completionRegistry ?? D({
			...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
			...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
		}), this.index.clearCompletionSnapshot(), O(this.completionRegistry, this.index);
	}
	updateAux(e) {
		this.index.updateAuxData(h(e));
	}
	updateAuxFiles(e) {
		this.index.updateAuxData(g(e));
	}
	updateEngineCommands(e) {
		this.index.updateEngineCommands(e);
	}
	updateSemanticTrace(e) {
		this.index.updateSemanticTrace(typeof e == "string" ? H(e) : e);
	}
	async updateCompletionSnapshot(e) {
		let t = r(e);
		this.assertCompletionProfile(t);
		let n = ++this.completionSnapshotUpdate, a = this.projectRevisionEpoch, o = this.fs.listFiles().flatMap((e) => {
			let t = this.fs.readFile(e);
			return t === null ? [] : [{
				path: e,
				content: typeof t == "string" ? t : Uint8Array.from(t)
			}];
		}), s = await i(o), c = a === this.projectRevisionEpoch && t.identity.projectRevision === s && t.identity.root === this.mainFile && this.fs.readFile(this.mainFile) !== null;
		return n === this.completionSnapshotUpdate ? (this.index.updateCompletionSnapshot(t), c || this.index.invalidateCompletionSnapshot(), this.index.getCompletionSnapshotState()) : this.index.getCompletionSnapshotState();
	}
	getCompletionSnapshotState() {
		return this.index.getCompletionSnapshotState();
	}
	clearCompletionSnapshot() {
		this.completionSnapshotUpdate++, this.index.clearCompletionSnapshot();
	}
	assertCompletionProfile(e) {
		let t = e.identity.profile, r = this.completionProfile;
		if (r && (r.id !== t.id || r.texliveYear !== t.texliveYear || r.mirrorRevision !== t.mirrorRevision)) throw new n("completion snapshot does not match the selected completion profile");
		for (let e of [this.resourceCatalog?.identity, this.semanticCatalog?.identity]) if (e && (e.texliveYear !== t.texliveYear || e.mirrorRevision !== t.mirrorRevision)) throw new n("completion snapshot does not match the selected catalog profile");
	}
	getDiagnostics() {
		let e = y(this.index);
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
		return B(this.textOf(e), t, n, S(this.index, e, this.completionRegistry));
	}
	getFoldingRanges(e) {
		return L(this.textOf(e));
	}
	getDocumentHighlights(e, t, n) {
		return F(e, t, n, this.index);
	}
	getWorkspaceSymbols(e) {
		return V(e, this.index);
	}
	getInlayHints(e) {
		return R(this.textOf(e), this.index);
	}
	getDocumentLinks(e) {
		return I(this.textOf(e));
	}
	getSemanticTokens(e) {
		return z(this.textOf(e));
	}
	getCodeActions(e, t) {
		return P(this.textOf(e), e, t, this.index);
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
		return b(this.docFor(e), {
			line: t,
			column: n
		}, S(this.index, e, this.completionRegistry));
	}
	getCompletions(e, t, n, r) {
		return this.getCompletionResult(e, t, n, r).items;
	}
	getCompletionResult(e, t, n, r) {
		return k(this.docFor(e), {
			line: t,
			column: n
		}, this.index, this.fs, {
			registry: this.completionRegistry,
			...r ? { cancellationToken: r } : {}
		});
	}
	getCompletionResultAsync(e, t, n, r) {
		return A(this.docFor(e), {
			line: t,
			column: n
		}, this.index, this.fs, {
			registry: this.completionRegistry,
			...r ? { cancellationToken: r } : {}
		});
	}
	getHover(e, t, n) {
		return M(this.docFor(e), {
			line: t,
			column: n
		}, this.index);
	}
	getDefinition(e, t, n) {
		return j(this.docFor(e), {
			line: t,
			column: n
		}, this.index);
	}
	getReferences(e, t, n) {
		return N(this.docFor(e), {
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
function X(e) {
	return new Y(e);
}
//#endregion
export { e as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, t as COMPLETION_SNAPSHOT_SCHEMA_VERSION, x as CompletionResolverRegistry, a as DEFAULT_LINT_CONFIG, G as HttpTexResourceCatalogProvider, C as HttpTexSemanticCatalogProvider, K as InMemoryTexResourceCatalogProvider, w as InMemoryTexSemanticCatalogProvider, Y as LatexLanguageService, p as PackageShardLoader, q as TEX_RESOURCE_CATALOG_SCHEMA_VERSION, T as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION, b as analyzeCompletionContext, D as createDefaultCompletionRegistry, X as createLatexLanguageService, s as formatSignature, c as getCommandPackage, l as getCommandSignature, u as getEnvironmentSignature, o as lintSource, g as parseAuxFiles, d as parseSignature, O as preloadSemanticCatalog, _ as readAuxFiles, f as registerShard, E as registerTexSemanticShard };
