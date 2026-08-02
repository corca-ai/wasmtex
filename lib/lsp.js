import { boundCompletionSnapshot as f, completionProjectRevision as C } from "./engine/completion-snapshot.js";
import { COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES as J, COMPLETION_SNAPSHOT_SCHEMA_VERSION as K } from "./engine/completion-snapshot.js";
import { VirtualFS as h } from "./fs/virtual-fs.js";
import { parseAuxFile as x } from "./lsp/aux-parser.js";
import { parseBibFileData as S } from "./lsp/bib-parser.js";
import { analyzeCompletionContext as F } from "./lsp/completion-context.js";
import { computeDiagnostics as v } from "./lsp/diagnostic-provider.js";
import { IncrementalLinter as d } from "./lsp/incremental-linter.js";
import { getSignatureHelp as R, getFoldingRanges as y, getDocumentHighlights as E, getWorkspaceSymbols as T, getInlayHints as O, getDocumentLinks as P, getSemanticTokens as b, getCodeActions as A } from "./lsp/language-features.js";
import { DEFAULT_LINT_CONFIG as Z, lintSource as ee } from "./lsp/linter.js";
import { createDefaultCompletionRegistry as p, preloadSemanticCatalog as g, provideCompletionResult as L, provideHover as w, provideDefinition as _, provideReferences as I } from "./lsp/neutral-providers.js";
import { ProjectIndex as u } from "./lsp/project-index.js";
import { parseTraceFile as j } from "./lsp/trace-parser.js";
import { CompletionResolverRegistry as ie } from "./lsp/completion-registry.js";
import { formatSignature as ne, getCommandPackage as re, getCommandSignature as se, getEnvironmentSignature as ae, parseSignature as le, registerShard as me } from "./lsp/package-db.js";
import { PackageShardLoader as he } from "./lsp/package-shard-loader.js";
import { HttpTexResourceCatalogProvider as pe, InMemoryTexResourceCatalogProvider as ge, TEX_RESOURCE_CATALOG_SCHEMA_VERSION as ue } from "./lsp/resource-catalog.js";
import { HttpTexSemanticCatalogProvider as Ce, InMemoryTexSemanticCatalogProvider as xe, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION as Se, registerTexSemanticShard as Fe } from "./lsp/semantic-catalog.js";
function l(s) {
  return /\.(?:tex|sty|cls|ltx)$/i.test(s);
}
class H {
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
    this.index.updateSemanticTrace(typeof e == "string" ? j(e) : e);
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
    return R(this.textOf(e), t, i);
  }
  getFoldingRanges(e) {
    return y(this.textOf(e));
  }
  getDocumentHighlights(e, t, i) {
    return E(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return T(e, this.index);
  }
  getInlayHints(e) {
    return O(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return P(this.textOf(e));
  }
  getSemanticTokens(e) {
    return b(this.textOf(e));
  }
  getCodeActions(e, t) {
    return A(this.textOf(e), e, t, this.index);
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
  getHover(e, t, i) {
    return w(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return _(this.docFor(e), { line: t, column: i }, this.index);
  }
  getReferences(e, t, i) {
    return I(this.docFor(e), { line: t, column: i }, this.index);
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
function z(s) {
  return new H(s);
}
export {
  J as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
  K as COMPLETION_SNAPSHOT_SCHEMA_VERSION,
  ie as CompletionResolverRegistry,
  Z as DEFAULT_LINT_CONFIG,
  pe as HttpTexResourceCatalogProvider,
  Ce as HttpTexSemanticCatalogProvider,
  ge as InMemoryTexResourceCatalogProvider,
  xe as InMemoryTexSemanticCatalogProvider,
  H as LatexLanguageService,
  he as PackageShardLoader,
  ue as TEX_RESOURCE_CATALOG_SCHEMA_VERSION,
  Se as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION,
  F as analyzeCompletionContext,
  p as createDefaultCompletionRegistry,
  z as createLatexLanguageService,
  ne as formatSignature,
  re as getCommandPackage,
  se as getCommandSignature,
  ae as getEnvironmentSignature,
  ee as lintSource,
  le as parseSignature,
  g as preloadSemanticCatalog,
  me as registerShard,
  Fe as registerTexSemanticShard
};
