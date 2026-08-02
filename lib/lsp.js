import { VirtualFS as l } from "./fs/virtual-fs.js";
import { parseAuxFile as u } from "./lsp/aux-parser.js";
import { parseBibFileData as d } from "./lsp/bib-parser.js";
import { analyzeCompletionContext as c } from "./lsp/completion-context.js";
import { computeDiagnostics as h } from "./lsp/diagnostic-provider.js";
import { IncrementalLinter as m } from "./lsp/incremental-linter.js";
import { getSignatureHelp as f, getFoldingRanges as x, getDocumentHighlights as C, getWorkspaceSymbols as p, getInlayHints as S, getDocumentLinks as F, getSemanticTokens as y, getCodeActions as R } from "./lsp/language-features.js";
import { DEFAULT_LINT_CONFIG as X, lintSource as z } from "./lsp/linter.js";
import { createDefaultCompletionRegistry as v, preloadSemanticCatalog as T, provideCompletionResult as b, provideHover as L, provideDefinition as A, provideReferences as O } from "./lsp/neutral-providers.js";
import { ProjectIndex as g } from "./lsp/project-index.js";
import { parseTraceFile as E } from "./lsp/trace-parser.js";
import { CompletionResolverRegistry as q } from "./lsp/completion-registry.js";
import { formatSignature as K, getCommandPackage as Q, getCommandSignature as Y, getEnvironmentSignature as Z, parseSignature as ee, registerShard as te } from "./lsp/package-db.js";
import { PackageShardLoader as re } from "./lsp/package-shard-loader.js";
import { HttpTexResourceCatalogProvider as se, InMemoryTexResourceCatalogProvider as oe, TEX_RESOURCE_CATALOG_SCHEMA_VERSION as ae } from "./lsp/resource-catalog.js";
import { HttpTexSemanticCatalogProvider as me, InMemoryTexSemanticCatalogProvider as ge, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION as ue, registerTexSemanticShard as de } from "./lsp/semantic-catalog.js";
function a(s) {
  return /\.(?:tex|sty|cls|ltx)$/i.test(s);
}
class w {
  fs = new l({ empty: !0 });
  index = new g();
  lint;
  linter;
  completionRegistry;
  resourceCatalog;
  semanticCatalog;
  constructor(e = {}) {
    this.lint = e.lint ?? !0, this.linter = new m(this.lint), this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.completionRegistry = e.completionRegistry ?? v({
      ...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
      ...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
    }), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
  }
  loadProject(e) {
    this.fs = new l({ empty: !0 }), this.index = new g(), this.linter = new m(this.lint);
    for (const [t, i] of Object.entries(e))
      this.updateFile(t, i);
  }
  updateFile(e, t) {
    if (this.fs.readFile(e) !== t) {
      if (this.fs.writeFile(e, t), this.linter.updateFile(e, t), typeof t != "string") {
        a(e) && this.index.removeFile(e), e.toLowerCase().endsWith(".bib") && this.index.removeBibFile(e);
        return;
      }
      a(e) && (this.index.updateFile(e, t), T(this.completionRegistry, this.index)), e.toLowerCase().endsWith(".bib") && this.index.updateBibFile(e, d(t, e));
    }
  }
  removeFile(e) {
    const t = this.fs.deleteFile(e);
    return this.linter.removeFile(e), a(e) && this.index.removeFile(e), e.toLowerCase().endsWith(".bib") && this.index.removeBibFile(e), t;
  }
  getFile(e) {
    return this.fs.readFile(e);
  }
  listFiles() {
    return this.fs.listFiles();
  }
  updateAux(e) {
    this.index.updateAuxData(u(e));
  }
  updateEngineCommands(e) {
    this.index.updateEngineCommands(e);
  }
  updateSemanticTrace(e) {
    this.index.updateSemanticTrace(typeof e == "string" ? E(e) : e);
  }
  getDiagnostics() {
    const e = h(this.index);
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
    return f(this.textOf(e), t, i);
  }
  getFoldingRanges(e) {
    return x(this.textOf(e));
  }
  getDocumentHighlights(e, t, i) {
    return C(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return p(e, this.index);
  }
  getInlayHints(e) {
    return S(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return F(this.textOf(e));
  }
  getSemanticTokens(e) {
    return y(this.textOf(e));
  }
  getCodeActions(e, t) {
    return R(this.textOf(e), e, t, this.index);
  }
  docFor(e) {
    const t = this.textOf(e), i = t.split(`
`);
    return { path: e, getText: () => t, lineAt: (r) => i[r - 1] ?? "" };
  }
  getCompletionContext(e, t, i) {
    return c(this.docFor(e), { line: t, column: i }, this.completionRegistry);
  }
  getCompletions(e, t, i, r) {
    return this.getCompletionResult(e, t, i, r).items;
  }
  getCompletionResult(e, t, i, r) {
    return b(this.docFor(e), { line: t, column: i }, this.index, this.fs, {
      registry: this.completionRegistry,
      ...r ? { cancellationToken: r } : {}
    });
  }
  getHover(e, t, i) {
    return L(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return A(this.docFor(e), { line: t, column: i }, this.index);
  }
  getReferences(e, t, i) {
    return O(this.docFor(e), { line: t, column: i }, this.index);
  }
  getRenameEdits(e, t, i, r) {
    const o = this.index.findSymbolAt(e, t, i);
    return o ? { edits: this.index.findAllOccurrences(o.name, o.type).map((n) => ({
      file: n.filePath,
      range: {
        startLineNumber: n.line,
        startColumn: n.column,
        endLineNumber: n.line,
        endColumn: n.column + n.length
      },
      newText: r
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
function V(s) {
  return new w(s);
}
export {
  q as CompletionResolverRegistry,
  X as DEFAULT_LINT_CONFIG,
  se as HttpTexResourceCatalogProvider,
  me as HttpTexSemanticCatalogProvider,
  oe as InMemoryTexResourceCatalogProvider,
  ge as InMemoryTexSemanticCatalogProvider,
  w as LatexLanguageService,
  re as PackageShardLoader,
  ae as TEX_RESOURCE_CATALOG_SCHEMA_VERSION,
  ue as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION,
  c as analyzeCompletionContext,
  v as createDefaultCompletionRegistry,
  V as createLatexLanguageService,
  K as formatSignature,
  Q as getCommandPackage,
  Y as getCommandSignature,
  Z as getEnvironmentSignature,
  z as lintSource,
  ee as parseSignature,
  T as preloadSemanticCatalog,
  te as registerShard,
  de as registerTexSemanticShard
};
