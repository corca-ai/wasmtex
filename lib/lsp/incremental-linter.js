import { lintSource as n } from "./linter.js";
class a {
  constructor(t, e = n) {
    this.lint = t, this.runLint = e;
  }
  cache = /* @__PURE__ */ new Map();
  updateFile(t, e) {
    return this.lint === !1 || !t.endsWith(".tex") || typeof e != "string" ? this.cache.delete(t) : this.cache.get(t)?.content === e ? !1 : (this.cache.set(t, {
      content: e,
      diagnostics: this.runLint(e, t, this.lint === !0 ? void 0 : this.lint)
    }), !0);
  }
  removeFile(t) {
    return this.cache.delete(t);
  }
  diagnostics(t) {
    const e = [];
    for (const i of t) {
      const s = this.cache.get(i);
      s && e.push(...s.diagnostics.map((c) => ({ ...c })));
    }
    return e;
  }
}
export {
  a as IncrementalLinter
};
