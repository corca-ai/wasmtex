import { boundCompletionSnapshot as f, completionProjectRevision as C } from "./engine/completion-snapshot.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as K, COMPLETION_SNAPSHOT_SCHEMA_VERSION as Q } from "./engine/completion-snapshot.js";
import { VirtualFS as h } from "./fs/virtual-fs.js";
import { parseAuxFile as x } from "./lsp/aux-parser.js";
import { parseBibFileData as S } from "./lsp/bib-parser.js";
import { analyzeCompletionContext as F } from "./lsp/completion-context.js";
import { computeDiagnostics as v } from "./lsp/diagnostic-provider.js";
import { IncrementalLinter as d } from "./lsp/incremental-linter.js";
import { getSignatureHelp as y, getFoldingRanges as R, getDocumentHighlights as E, getWorkspaceSymbols as T, getInlayHints as A, getDocumentLinks as O, getSemanticTokens as P, getCodeActions as b } from "./lsp/language-features.js";
import { DEFAULT_LINT_CONFIG as ee, lintSource as te } from "./lsp/linter.js";
import { createDefaultCompletionRegistry as p, preloadSemanticCatalog as g, provideCompletionResult as L, provideCompletionResultAsync as w, provideHover as _, provideDefinition as I, provideReferences as j } from "./lsp/neutral-providers.js";
import { ProjectIndex as u } from "./lsp/project-index.js";
import { parseTraceFile as H } from "./lsp/trace-parser.js";
import { CompletionResolverRegistry as oe } from "./lsp/completion-registry.js";
import { formatSignature as re, getCommandPackage as se, getCommandSignature as ae, getEnvironmentSignature as le, parseSignature as me, registerShard as ce } from "./lsp/package-db.js";
import { PackageShardLoader as de } from "./lsp/package-shard-loader.js";
import { HttpTexResourceCatalogProvider as ge, InMemoryTexResourceCatalogProvider as ue, TEX_RESOURCE_CATALOG_SCHEMA_VERSION as fe } from "./lsp/resource-catalog.js";
import { HttpTexSemanticCatalogProvider as xe, InMemoryTexSemanticCatalogProvider as Se, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION as Fe, registerTexSemanticShard as ve } from "./lsp/semantic-catalog.js";
function l(s) {
  return /\.(?:tex|sty|cls|ltx)$/i.test(s);
}
class D {
  fs = new h({ empty: !0 });
  index = new u();
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
    this.lint = e.lint ?? !0, this.linter = new d(this.lint), this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.mainFile = e.mainFile ?? "main.tex", this.completionProfile = e.completionProfile, this.completionRegistry = e.completionRegistry ?? p({
      ...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
      ...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
    }), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
  }
  loadProject(e) {
    this.projectRevisionEpoch++, this.fs = new h({ empty: !0 }), this.index = new u(), this.linter = new d(this.lint);
    for (const [t, i] of Object.entries(e))
      this.updateFile(t, i);
  }
  updateFile(e, t) {
    if (this.fs.readFile(e) !== t) {
      if (this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot(), this.fs.writeFile(e, t), this.linter.updateFile(e, t), typeof t != "string") {
        l(e) && this.index.removeFile(e), e.toLowerCase().endsWith(".bib") && this.index.removeBibFile(e);
        return;
      }
      l(e) && (this.index.updateFile(e, t), g(this.completionRegistry, this.index)), e.toLowerCase().endsWith(".bib") && this.index.updateBibFile(e, S(t, e));
    }
  }
  removeFile(e) {
    const t = this.fs.deleteFile(e);
    return t ? (this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot(), this.linter.removeFile(e), l(e) && this.index.removeFile(e), e.toLowerCase().endsWith(".bib") && this.index.removeBibFile(e), t) : !1;
  }
  getFile(e) {
    return this.fs.readFile(e);
  }
  listFiles() {
    return this.fs.listFiles();
  }
  setMainFile(e) {
    if (!e.trim()) throw new Error("main file path must not be empty");
    e !== this.mainFile && (this.mainFile = e, this.projectRevisionEpoch++, this.index.invalidateCompletionSnapshot());
  }
  configureCompletion(e) {
    this.completionSnapshotUpdate++, this.completionProfile = e.completionProfile, this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.completionRegistry = e.completionRegistry ?? p({
      ...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
      ...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
    }), this.index.clearCompletionSnapshot(), g(this.completionRegistry, this.index);
  }
  updateAux(e) {
    this.index.updateAuxData(x(e));
  }
  updateEngineCommands(e) {
    this.index.updateEngineCommands(e);
  }
  updateSemanticTrace(e) {
    this.index.updateSemanticTrace(typeof e == "string" ? H(e) : e);
  }
  async updateCompletionSnapshot(e) {
    const t = f(e);
    this.assertCompletionProfile(t);
    const i = ++this.completionSnapshotUpdate, o = this.projectRevisionEpoch, r = this.fs.listFiles().flatMap((c) => {
      const a = this.fs.readFile(c);
      return a === null ? [] : [{ path: c, content: typeof a == "string" ? a : Uint8Array.from(a) }];
    }), m = await C(r), n = o === this.projectRevisionEpoch && t.identity.projectRevision === m && t.identity.root === this.mainFile && this.fs.readFile(this.mainFile) !== null;
    return i !== this.completionSnapshotUpdate ? this.index.getCompletionSnapshotState() : (this.index.updateCompletionSnapshot(t), n || this.index.invalidateCompletionSnapshot(), this.index.getCompletionSnapshotState());
  }
  getCompletionSnapshotState() {
    return this.index.getCompletionSnapshotState();
  }
  clearCompletionSnapshot() {
    this.completionSnapshotUpdate++, this.index.clearCompletionSnapshot();
  }
  assertCompletionProfile(e) {
    const t = e.identity.profile, i = this.completionProfile;
    if (i && (i.id !== t.id || i.texliveYear !== t.texliveYear || i.mirrorRevision !== t.mirrorRevision))
      throw new Error("completion snapshot does not match the selected completion profile");
    for (const o of [this.resourceCatalog?.identity, this.semanticCatalog?.identity])
      if (o && (o.texliveYear !== t.texliveYear || o.mirrorRevision !== t.mirrorRevision))
        throw new Error("completion snapshot does not match the selected catalog profile");
  }
  getDiagnostics() {
    const e = v(this.index);
    return e.push(...this.linter.diagnostics(this.fs.listFiles())), e;
  }
  getFileSymbols(e) {
    return this.index.getFileSymbols(e);
  }
  getOutline(e) {
    return this.index.getFileSymbols(e)?.sections ?? [];
  }
  // --- Editor-neutral language features (see language-features.ts) ---
  textOf(e) {
    const t = this.fs.readFile(e);
    return typeof t == "string" ? t : "";
  }
  getSignatureHelp(e, t, i) {
    return y(this.textOf(e), t, i);
  }
  getFoldingRanges(e) {
    return R(this.textOf(e));
  }
  getDocumentHighlights(e, t, i) {
    return E(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return T(e, this.index);
  }
  getInlayHints(e) {
    return A(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return O(this.textOf(e));
  }
  getSemanticTokens(e) {
    return P(this.textOf(e));
  }
  getCodeActions(e, t) {
    return b(this.textOf(e), e, t, this.index);
  }
  docFor(e) {
    const t = this.textOf(e), i = t.split(`
`);
    return { path: e, getText: () => t, lineAt: (o) => i[o - 1] ?? "" };
  }
  getCompletionContext(e, t, i) {
    return F(this.docFor(e), { line: t, column: i }, this.completionRegistry);
  }
  getCompletions(e, t, i, o) {
    return this.getCompletionResult(e, t, i, o).items;
  }
  getCompletionResult(e, t, i, o) {
    return L(this.docFor(e), { line: t, column: i }, this.index, this.fs, {
      registry: this.completionRegistry,
      ...o ? { cancellationToken: o } : {}
    });
  }
  /** Resolve completion after request-scoped lazy catalog loads settle once. */
  getCompletionResultAsync(e, t, i, o) {
    return w(this.docFor(e), { line: t, column: i }, this.index, this.fs, {
      registry: this.completionRegistry,
      ...o ? { cancellationToken: o } : {}
    });
  }
  getHover(e, t, i) {
    return _(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return I(this.docFor(e), { line: t, column: i }, this.index);
  }
  getReferences(e, t, i) {
    return j(this.docFor(e), { line: t, column: i }, this.index);
  }
  getRenameEdits(e, t, i, o) {
    const r = this.index.findSymbolAt(e, t, i);
    return r ? { edits: this.index.findAllOccurrences(r.name, r.type).map((n) => ({
      file: n.filePath,
      range: {
        startLineNumber: n.line,
        startColumn: n.column,
        endLineNumber: n.line,
        endColumn: n.column + n.length
      },
      newText: o
    })) } : void 0;
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
}
function $(s) {
  return new D(s);
}
export {
  K as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
  Q as COMPLETION_SNAPSHOT_SCHEMA_VERSION,
  oe as CompletionResolverRegistry,
  ee as DEFAULT_LINT_CONFIG,
  ge as HttpTexResourceCatalogProvider,
  xe as HttpTexSemanticCatalogProvider,
  ue as InMemoryTexResourceCatalogProvider,
  Se as InMemoryTexSemanticCatalogProvider,
  D as LatexLanguageService,
  de as PackageShardLoader,
  fe as TEX_RESOURCE_CATALOG_SCHEMA_VERSION,
  Fe as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION,
  F as analyzeCompletionContext,
  p as createDefaultCompletionRegistry,
  $ as createLatexLanguageService,
  re as formatSignature,
  se as getCommandPackage,
  ae as getCommandSignature,
  le as getEnvironmentSignature,
  te as lintSource,
  me as parseSignature,
  g as preloadSemanticCatalog,
  ce as registerShard,
  ve as registerTexSemanticShard
};
