import { lintSource as e } from "./linter.js";
//#region src/lsp/incremental-linter.ts
var t = class {
	lint;
	runLint;
	cache = /* @__PURE__ */ new Map();
	constructor(t, n = e) {
		this.lint = t, this.runLint = n;
	}
	updateFile(e, t) {
		return this.lint === !1 || !e.endsWith(".tex") || typeof t != "string" ? this.cache.delete(e) : this.cache.get(e)?.content !== t && (this.cache.set(e, {
			content: t,
			diagnostics: this.runLint(t, e, this.lint === !0 ? void 0 : this.lint)
		}), !0);
	}
	removeFile(e) {
		return this.cache.delete(e);
	}
	diagnostics(e) {
		let t = [];
		for (let n of e) {
			let e = this.cache.get(n);
			e && t.push(...e.diagnostics.map((e) => ({ ...e })));
		}
		return t;
	}
};
//#endregion
export { t as IncrementalLinter };
