import { VirtualFS as d } from "./fs/virtual-fs.js";
import { parseAuxFile as a } from "./lsp/aux-parser.js";
import { rebuildBibIndex as m } from "./lsp/bib-parser.js";
import { computeDiagnostics as g } from "./lsp/diagnostic-provider.js";
import { IncrementalLinter as u } from "./lsp/incremental-linter.js";
import { getSignatureHelp as h, getFoldingRanges as f, getDocumentHighlights as x, getWorkspaceSymbols as c, getInlayHints as p, getDocumentLinks as F, getSemanticTokens as S, getCodeActions as b } from "./lsp/language-features.js";
import { DEFAULT_LINT_CONFIG as V, lintSource as _ } from "./lsp/linter.js";
import { provideCompletions as v, provideHover as y, provideDefinition as C, provideReferences as I } from "./lsp/neutral-providers.js";
import { ProjectIndex as l } from "./lsp/project-index.js";
import { parseTraceFile as L } from "./lsp/trace-parser.js";
import { formatSignature as U, getCommandPackage as q, getCommandSignature as z, parseSignature as J, registerShard as K } from "./lsp/package-db.js";
import { PackageShardLoader as Q } from "./lsp/package-shard-loader.js";
class O {
  fs = new d({ empty: !0 });
  index = new l();
  lint;
  linter;
  constructor(e = {}) {
    this.lint = e.lint ?? !0, this.linter = new u(this.lint), this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
  }
  loadProject(e) {
    this.fs = new d({ empty: !0 }), this.index = new l(), this.linter = new u(this.lint);
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
    this.index.updateAuxData(a(e));
  }
  updateEngineCommands(e) {
    this.index.updateEngineCommands(e);
  }
  updateSemanticTrace(e) {
    this.index.updateSemanticTrace(typeof e == "string" ? L(e) : e);
  }
  getDiagnostics() {
    const e = g(this.index);
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
    return f(this.textOf(e));
  }
  getDocumentHighlights(e, t, i) {
    return x(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return c(e, this.index);
  }
  getInlayHints(e) {
    return p(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return F(this.textOf(e));
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
    return { path: e, getText: () => t, lineAt: (r) => i[r - 1] ?? "" };
  }
  getCompletions(e, t, i) {
    return v(this.docFor(e), { line: t, column: i }, this.index, this.fs);
  }
  getHover(e, t, i) {
    return y(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return C(this.docFor(e), { line: t, column: i }, this.index);
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
  updateBibIndex() {
    m(this.fs, this.index);
  }
}
function E(o) {
  return new O(o);
}
export {
  V as DEFAULT_LINT_CONFIG,
  O as LatexLanguageService,
  Q as PackageShardLoader,
  E as createLatexLanguageService,
  U as formatSignature,
  q as getCommandPackage,
  z as getCommandSignature,
  _ as lintSource,
  J as parseSignature,
  K as registerShard
};
