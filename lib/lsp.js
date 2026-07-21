import { VirtualFS as d } from "./fs/virtual-fs.js";
import { parseAuxFile as a } from "./lsp/aux-parser.js";
import { rebuildBibIndex as l } from "./lsp/bib-parser.js";
import { computeDiagnostics as m } from "./lsp/diagnostic-provider.js";
import { getSignatureHelp as g, getFoldingRanges as f, getDocumentHighlights as h, getWorkspaceSymbols as c, getInlayHints as x, getDocumentLinks as p, getSemanticTokens as F, getCodeActions as S } from "./lsp/language-features.js";
import { lintSource as b } from "./lsp/linter.js";
import { DEFAULT_LINT_CONFIG as V } from "./lsp/linter.js";
import { provideCompletions as y, provideHover as C, provideDefinition as v, provideReferences as O } from "./lsp/neutral-providers.js";
import { ProjectIndex as u } from "./lsp/project-index.js";
import { parseTraceFile as T } from "./lsp/trace-parser.js";
import { formatSignature as G, getCommandPackage as U, getCommandSignature as q, parseSignature as z, registerShard as J } from "./lsp/package-db.js";
import { PackageShardLoader as M } from "./lsp/package-shard-loader.js";
class L {
  fs = new d({ empty: !0 });
  index = new u();
  lint;
  constructor(e = {}) {
    this.lint = e.lint ?? !0, this.loadProject(e.files ?? {}), e.aux && this.updateAux(e.aux), e.engineCommands && this.updateEngineCommands(e.engineCommands), e.semanticTrace && this.updateSemanticTrace(e.semanticTrace);
  }
  loadProject(e) {
    this.fs = new d({ empty: !0 }), this.index = new u();
    for (const [t, i] of Object.entries(e))
      this.updateFile(t, i);
  }
  updateFile(e, t) {
    this.fs.writeFile(e, t), typeof t == "string" && (e.endsWith(".tex") && this.index.updateFile(e, t), e.endsWith(".bib") && this.updateBibIndex());
  }
  removeFile(e) {
    const t = this.fs.deleteFile(e);
    return e.endsWith(".tex") && this.index.removeFile(e), e.endsWith(".bib") && this.updateBibIndex(), t;
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
    this.index.updateSemanticTrace(typeof e == "string" ? T(e) : e);
  }
  getDiagnostics() {
    const e = m(this.index);
    if (this.lint === !1) return e;
    const t = this.lint === !0 ? void 0 : this.lint;
    for (const i of this.fs.listFiles()) {
      if (!i.endsWith(".tex")) continue;
      const n = this.fs.readFile(i);
      typeof n == "string" && e.push(...b(n, i, t));
    }
    return e;
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
    return g(this.textOf(e), t, i);
  }
  getFoldingRanges(e) {
    return f(this.textOf(e));
  }
  getDocumentHighlights(e, t, i) {
    return h(e, t, i, this.index);
  }
  getWorkspaceSymbols(e) {
    return c(e, this.index);
  }
  getInlayHints(e) {
    return x(this.textOf(e), this.index);
  }
  getDocumentLinks(e) {
    return p(this.textOf(e));
  }
  getSemanticTokens(e) {
    return F(this.textOf(e));
  }
  getCodeActions(e, t) {
    return S(this.textOf(e), e, t, this.index);
  }
  docFor(e) {
    const t = this.textOf(e), i = t.split(`
`);
    return { path: e, getText: () => t, lineAt: (n) => i[n - 1] ?? "" };
  }
  getCompletions(e, t, i) {
    return y(this.docFor(e), { line: t, column: i }, this.index, this.fs);
  }
  getHover(e, t, i) {
    return C(this.docFor(e), { line: t, column: i }, this.index);
  }
  getDefinition(e, t, i) {
    return v(this.docFor(e), { line: t, column: i }, this.index);
  }
  getReferences(e, t, i) {
    return O(this.docFor(e), { line: t, column: i }, this.index);
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
  updateBibIndex() {
    l(this.fs, this.index);
  }
}
function R(o) {
  return new L(o);
}
export {
  V as DEFAULT_LINT_CONFIG,
  L as LatexLanguageService,
  M as PackageShardLoader,
  R as createLatexLanguageService,
  G as formatSignature,
  U as getCommandPackage,
  q as getCommandSignature,
  b as lintSource,
  z as parseSignature,
  J as registerShard
};
