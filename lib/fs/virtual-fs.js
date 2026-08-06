import { DEFAULT_ALGEBRA as e, DEFAULT_ANALYSIS as t, DEFAULT_LINALG as n, DEFAULT_REFS_BIB as r, DEFAULT_TEX as i } from "./default-project.js";
//#region src/fs/virtual-fs.ts
var a = class {
	files = /* @__PURE__ */ new Map();
	listeners = [];
	constructor(a) {
		a?.empty || (this.writeFile("main.tex", i), this.writeFile("algebra.tex", e), this.writeFile("analysis.tex", t), this.writeFile("linalg.tex", n), this.writeFile("refs.bib", r));
	}
	writeFile(e, t) {
		this.files.set(e, {
			path: e,
			content: t,
			modified: !0
		}), this.notify();
	}
	readFile(e) {
		return this.files.get(e)?.content ?? null;
	}
	deleteFile(e) {
		let t = this.files.delete(e);
		return t && this.notify(), t;
	}
	listFiles() {
		return Array.from(this.files.keys()).sort();
	}
	getFile(e) {
		return this.files.get(e);
	}
	getModifiedFiles() {
		return Array.from(this.files.values()).filter((e) => e.modified);
	}
	markSynced(e) {
		for (let t of e ?? this.files.values()) t.modified = !1;
	}
	markAllModified() {
		for (let e of this.files.values()) e.modified = !0;
	}
	onChange(e) {
		return this.listeners.push(e), () => {
			let t = this.listeners.indexOf(e);
			t !== -1 && this.listeners.splice(t, 1);
		};
	}
	notify() {
		for (let e of [...this.listeners]) this.listeners.includes(e) && e();
	}
};
//#endregion
export { a as VirtualFS };
