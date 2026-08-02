import { VirtualFS as a } from "./fs/virtual-fs.js";
import { parseAuxFile as m } from "./lsp/aux-parser.js";
import { rebuildBibIndex as u } from "./lsp/bib-parser.js";
import { analyzeCompletionContext as d } from "./lsp/completion-context.js";
import { computeDiagnostics as c } from "./lsp/diagnostic-provider.js";
import { IncrementalLinter as l } from "./lsp/incremental-linter.js";
import { getSignatureHelp as h, getFoldingRanges as x, getDocumentHighlights as f, getWorkspaceSymbols as C, getInlayHints as p, getDocumentLinks as S, getSemanticTokens as F, getCodeActions as y } from "./lsp/language-features.js";
import { DEFAULT_LINT_CONFIG as U, lintSource as X } from "./lsp/linter.js";
import { createDefaultCompletionRegistry as R, preloadSemanticCatalog as b, provideCompletionResult as v, provideHover as T, provideDefinition as A, provideReferences as I } from "./lsp/neutral-providers.js";
import { ProjectIndex as g } from "./lsp/project-index.js";
import { parseTraceFile as O } from "./lsp/trace-parser.js";
import { CompletionResolverRegistry as q } from "./lsp/completion-registry.js";
import { formatSignature as K, getCommandPackage as Q, getCommandSignature as Y, getEnvironmentSignature as Z, parseSignature as $, registerShard as ee } from "./lsp/package-db.js";
import { PackageShardLoader as ie } from "./lsp/package-shard-loader.js";
import { HttpTexResourceCatalogProvider as ne, InMemoryTexResourceCatalogProvider as se, TEX_RESOURCE_CATALOG_SCHEMA_VERSION as oe } from "./lsp/resource-catalog.js";
import { HttpTexSemanticCatalogProvider as le, InMemoryTexSemanticCatalogProvider as ge, TEX_SEMANTIC_CATALOG_SCHEMA_VERSION as me, registerTexSemanticShard as ue } from "./lsp/semantic-catalog.js";
class E {
  fs = new a({ empty: !0 });
  index = new g();
  lint;
  linter;
  completionRegistry;
  resourceCatalog;
  semanticCatalog;
  constructor(e = {}) {
    this.lint = e.lint ?? !0, this.linter = new l(this.lint), this.resourceCatalog = e.resourceCatalog, this.semanticCatalog = e.semanticCatalog, this.completionRegistry = e.completionRegistry ?? R({
      ...e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {},
      ...e.semanticCatalog ? { semanticCatalog: e.semanticCatalog } : {}
    }), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
  }
  loadProject(e) {
    this.fs = new a({ empty: !0 }), this.index = new g(), this.linter = new l(this.lint);
    for (const [t, i] of Object.entries(e))
      this.updateFile(t, i);
  }
  updateFile(e, t) {
    if (this.fs.readFile(e) !== t) {
      if (this.fs.writeFile(e, t), this.linter.updateFile(e, t), typeof t != "string") {
        e.endsWith(".tex") && this.index.removeFile(e), e.endsWith(".bib") && this.updateBibIndex();
        return;
      }
      e.endsWith(".tex") && (this.index.updateFile(e, t), b(this.completionRegistry, this.index)), e.endsWith(".bib") && this.updateBibIndex();
    }
  }
  removeFile(e) {
    const t = this.fs.deleteFile(e);
    return this.linter.removeFile(e), e.endsWith(".tex") && this.index.removeFile(e), e.endsWith(".bib") && this.updateBibIndex(), t;
  }
  getFile(e) {
    return this.fs.readFile(e);
  }
  listFiles() {
    return this.fs.listFiles();
  }
  updateAux(e) {
    this.index.updateAuxData(m(e));
  }
  updateEngineCommands(e) {
    this.index.updateEngineCommands(e);
  }
  updateSemanticTrace(e) {
    this.index.updateSemanticTrace(typeof e == "string" ? O(e) : e);
  }
  getDiagnostics() {
    const e = c(this.index);
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
    return h(this.textOf(e), t, i);
  }
  getFoldingRanges(e) {
    return x(this.textOf(e));
  }
  getDocumentHighlights(e, t, i) {
    return f(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return C(e, this.index);
  }
  getInlayHints(e) {
    return p(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return S(this.textOf(e));
  }
  getSemanticTokens(e) {
    return F(this.textOf(e));
  }
  getCodeActions(e, t) {
    return y(this.textOf(e), e, t, this.index);
  }
  docFor(e) {
    const t = this.textOf(e), i = t.split(`
`);
    return { path: e, getText: () => t, lineAt: (r) => i[r - 1] ?? "" };
  }
  getCompletionContext(e, t, i) {
    return d(this.docFor(e), { line: t, column: i }, this.completionRegistry);
  }
  getCompletions(e, t, i, r) {
    return this.getCompletionResult(e, t, i, r).items;
  }
  getCompletionResult(e, t, i, r) {
    return v(this.docFor(e), { line: t, column: i }, this.index, this.fs, {
      registry: this.completionRegistry,
      ...r ? { cancellationToken: r } : {}
    });
  }
  getHover(e, t, i) {
    return T(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return A(this.docFor(e), { line: t, column: i }, this.index);
  }
  getReferences(e, t, i) {
    return I(this.docFor(e), { line: t, column: i }, this.index);
  }
  getRenameEdits(e, t, i, r) {
    const s = this.index.findSymbolAt(e, t, i);
    return s ? { edits: this.index.findAllOccurrences(s.name, s.type).map((n) => ({
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
  updateBibIndex() {
    u(this.fs, this.index);
  }
}
function M(o) {
  return new E(o);
}
export {
  q as CompletionResolverRegistry,
  U as DEFAULT_LINT_CONFIG,
  ne as HttpTexResourceCatalogProvider,
  le as HttpTexSemanticCatalogProvider,
  se as InMemoryTexResourceCatalogProvider,
  ge as InMemoryTexSemanticCatalogProvider,
  E as LatexLanguageService,
  ie as PackageShardLoader,
  oe as TEX_RESOURCE_CATALOG_SCHEMA_VERSION,
  me as TEX_SEMANTIC_CATALOG_SCHEMA_VERSION,
  d as analyzeCompletionContext,
  R as createDefaultCompletionRegistry,
  M as createLatexLanguageService,
  K as formatSignature,
  Q as getCommandPackage,
  Y as getCommandSignature,
  Z as getEnvironmentSignature,
  X as lintSource,
  $ as parseSignature,
  b as preloadSemanticCatalog,
  ee as registerShard,
  ue as registerTexSemanticShard
};
