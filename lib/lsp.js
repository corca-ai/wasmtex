import { VirtualFS as d } from "./fs/virtual-fs.js";
import { parseAuxFile as u } from "./lsp/aux-parser.js";
import { rebuildBibIndex as g } from "./lsp/bib-parser.js";
import { analyzeCompletionContext as a } from "./lsp/completion-context.js";
import { computeDiagnostics as h } from "./lsp/diagnostic-provider.js";
import { IncrementalLinter as l } from "./lsp/incremental-linter.js";
import { getSignatureHelp as f, getFoldingRanges as x, getDocumentHighlights as c, getWorkspaceSymbols as p, getInlayHints as F, getDocumentLinks as y, getSemanticTokens as S, getCodeActions as b } from "./lsp/language-features.js";
import { DEFAULT_LINT_CONFIG as G, lintSource as U } from "./lsp/linter.js";
import { createDefaultCompletionRegistry as C, provideCompletions as v, provideHover as R, provideDefinition as I, provideReferences as L } from "./lsp/neutral-providers.js";
import { ProjectIndex as m } from "./lsp/project-index.js";
import { parseTraceFile as O } from "./lsp/trace-parser.js";
import { CompletionResolverRegistry as J } from "./lsp/completion-registry.js";
import { formatSignature as M, getCommandPackage as Q, getCommandSignature as X, getEnvironmentSignature as Y, parseSignature as Z, registerShard as $ } from "./lsp/package-db.js";
import { PackageShardLoader as te } from "./lsp/package-shard-loader.js";
class D {
  fs = new d({ empty: !0 });
  index = new m();
  lint;
  linter;
  completionRegistry;
  constructor(e = {}) {
    this.lint = e.lint ?? !0, this.linter = new l(this.lint), this.completionRegistry = e.completionRegistry ?? C(), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
  }
  loadProject(e) {
    this.fs = new d({ empty: !0 }), this.index = new m(), this.linter = new l(this.lint);
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
    this.index.updateAuxData(u(e));
  }
  updateEngineCommands(e) {
    this.index.updateEngineCommands(e);
  }
  updateSemanticTrace(e) {
    this.index.updateSemanticTrace(typeof e == "string" ? O(e) : e);
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
    return c(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return p(e, this.index);
  }
  getInlayHints(e) {
    return F(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return y(this.textOf(e));
  }
  getSemanticTokens(e) {
    return S(this.textOf(e));
  }
  getCodeActions(e, t) {
    return b(this.textOf(e), e, t, this.index);
  }
  docFor(e) {
    const t = this.textOf(e), i = t.split(`
`);
    return { path: e, getText: () => t, lineAt: (n) => i[n - 1] ?? "" };
  }
  getCompletionContext(e, t, i) {
    return a(this.docFor(e), { line: t, column: i }, this.completionRegistry);
  }
  getCompletions(e, t, i, n) {
    return v(this.docFor(e), { line: t, column: i }, this.index, this.fs, {
      registry: this.completionRegistry,
      ...n ? { cancellationToken: n } : {}
    });
  }
  getHover(e, t, i) {
    return R(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return I(this.docFor(e), { line: t, column: i }, this.index);
  }
  getReferences(e, t, i) {
    return L(this.docFor(e), { line: t, column: i }, this.index);
  }
  getRenameEdits(e, t, i, n) {
    const s = this.index.findSymbolAt(e, t, i);
    return s ? { edits: this.index.findAllOccurrences(s.name, s.type).map((r) => ({
      file: r.filePath,
      range: {
        startLineNumber: r.line,
        startColumn: r.column,
        endLineNumber: r.line,
        endColumn: r.column + r.length
      },
      newText: n
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
  updateBibIndex() {
    g(this.fs, this.index);
  }
}
function V(o) {
  return new D(o);
}
export {
  J as CompletionResolverRegistry,
  G as DEFAULT_LINT_CONFIG,
  D as LatexLanguageService,
  te as PackageShardLoader,
  a as analyzeCompletionContext,
  C as createDefaultCompletionRegistry,
  V as createLatexLanguageService,
  M as formatSignature,
  Q as getCommandPackage,
  X as getCommandSignature,
  Y as getEnvironmentSignature,
  U as lintSource,
  Z as parseSignature,
  $ as registerShard
};
