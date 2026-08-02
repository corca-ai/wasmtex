import { VirtualFS as l } from "./fs/virtual-fs.js";
import { parseAuxFile as d } from "./lsp/aux-parser.js";
import { rebuildBibIndex as g } from "./lsp/bib-parser.js";
import { analyzeCompletionContext as m } from "./lsp/completion-context.js";
import { computeDiagnostics as h } from "./lsp/diagnostic-provider.js";
import { IncrementalLinter as a } from "./lsp/incremental-linter.js";
import { getSignatureHelp as c, getFoldingRanges as f, getDocumentHighlights as x, getWorkspaceSymbols as p, getInlayHints as C, getDocumentLinks as F, getSemanticTokens as S, getCodeActions as y } from "./lsp/language-features.js";
import { DEFAULT_LINT_CONFIG as M, lintSource as U } from "./lsp/linter.js";
import { createDefaultCompletionRegistry as R, provideCompletionResult as b, provideHover as v, provideDefinition as O, provideReferences as T } from "./lsp/neutral-providers.js";
import { ProjectIndex as u } from "./lsp/project-index.js";
import { parseTraceFile as I } from "./lsp/trace-parser.js";
import { CompletionResolverRegistry as X } from "./lsp/completion-registry.js";
import { formatSignature as J, getCommandPackage as K, getCommandSignature as Q, getEnvironmentSignature as Y, parseSignature as Z, registerShard as $ } from "./lsp/package-db.js";
import { PackageShardLoader as te } from "./lsp/package-shard-loader.js";
import { HttpTexResourceCatalogProvider as re, InMemoryTexResourceCatalogProvider as ne, TEX_RESOURCE_CATALOG_SCHEMA_VERSION as se } from "./lsp/resource-catalog.js";
class A {
  fs = new l({ empty: !0 });
  index = new u();
  lint;
  linter;
  completionRegistry;
  resourceCatalog;
  constructor(e = {}) {
    this.lint = e.lint ?? !0, this.linter = new a(this.lint), this.resourceCatalog = e.resourceCatalog, this.completionRegistry = e.completionRegistry ?? R(
      e.resourceCatalog ? { resourceCatalog: e.resourceCatalog } : {}
    ), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
  }
  loadProject(e) {
    this.fs = new l({ empty: !0 }), this.index = new u(), this.linter = new a(this.lint);
    for (const [t, i] of Object.entries(e))
      this.updateFile(t, i);
  }
  updateFile(e, t) {
    if (this.fs.readFile(e) !== t) {
      if (this.fs.writeFile(e, t), this.linter.updateFile(e, t), typeof t != "string") {
        e.endsWith(".tex") && this.index.removeFile(e), e.endsWith(".bib") && this.updateBibIndex();
        return;
      }
      e.endsWith(".tex") && this.index.updateFile(e, t), e.endsWith(".bib") && this.updateBibIndex();
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
    this.index.updateAuxData(d(e));
  }
  updateEngineCommands(e) {
    this.index.updateEngineCommands(e);
  }
  updateSemanticTrace(e) {
    this.index.updateSemanticTrace(typeof e == "string" ? I(e) : e);
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
    return c(this.textOf(e), t, i);
  }
  getFoldingRanges(e) {
    return f(this.textOf(e));
  }
  getDocumentHighlights(e, t, i) {
    return x(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return p(e, this.index);
  }
  getInlayHints(e) {
    return C(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return F(this.textOf(e));
  }
  getSemanticTokens(e) {
    return S(this.textOf(e));
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
    return m(this.docFor(e), { line: t, column: i }, this.completionRegistry);
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
    return v(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return O(this.docFor(e), { line: t, column: i }, this.index);
  }
  getReferences(e, t, i) {
    return T(this.docFor(e), { line: t, column: i }, this.index);
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
  updateBibIndex() {
    g(this.fs, this.index);
  }
}
function N(o) {
  return new A(o);
}
export {
  X as CompletionResolverRegistry,
  M as DEFAULT_LINT_CONFIG,
  re as HttpTexResourceCatalogProvider,
  ne as InMemoryTexResourceCatalogProvider,
  A as LatexLanguageService,
  te as PackageShardLoader,
  se as TEX_RESOURCE_CATALOG_SCHEMA_VERSION,
  m as analyzeCompletionContext,
  R as createDefaultCompletionRegistry,
  N as createLatexLanguageService,
  J as formatSignature,
  K as getCommandPackage,
  Q as getCommandSignature,
  Y as getEnvironmentSignature,
  U as lintSource,
  Z as parseSignature,
  $ as registerShard
};
