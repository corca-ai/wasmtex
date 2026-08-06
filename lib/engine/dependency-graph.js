import { scanFileEvents as e } from "./parse-errors.js";
//#region src/engine/dependency-graph.ts
var t = {
	tex: "tex",
	ltx: "tex",
	cls: "class",
	sty: "package",
	otf: "font",
	ttf: "font",
	pfb: "font",
	bib: "bib",
	bbl: "bib",
	bst: "bib",
	png: "image",
	jpg: "image",
	jpeg: "image",
	eps: "image",
	pdf: "image"
};
function n(e) {
	return t[e.slice(e.lastIndexOf(".") + 1).toLowerCase()] ?? "other";
}
function r(e) {
	let t = n(e);
	return t === "tex" ? "includes" : t === "package" || t === "class" ? "loads" : "reads";
}
function i(e) {
	return e.startsWith("./") || e.startsWith("/work/") ? "project" : e.startsWith("/") ? "system" : "project";
}
function a(e) {
	let t = i(e), n = e;
	return n.startsWith("/work/") && (n = n.slice(6)), n = n.replace(/\/\.\//g, "/").replace(/^\.\//, ""), {
		id: t === "system" ? n.replace(/^.*\//, "") : n,
		origin: t
	};
}
var o = class {
	nodes = /* @__PURE__ */ new Map();
	edges = /* @__PURE__ */ new Map();
	root;
	addNode(e, t, n, r) {
		let i = this.nodes.get(e);
		if (i) {
			i.discoveredBy.includes(r) || i.discoveredBy.push(r);
			return;
		}
		this.nodes.set(e, {
			id: e,
			kind: t,
			origin: n,
			discoveredBy: [r]
		});
	}
	addEdge(e, t, n, r) {
		if (e === t) return;
		let i = `${e}\t${t}\t${n}`, a = this.edges.get(i);
		if (a) {
			a.discoveredBy.includes(r) || a.discoveredBy.push(r);
			return;
		}
		this.edges.set(i, {
			from: e,
			to: t,
			relation: n,
			discoveredBy: [r]
		});
	}
	build() {
		this.root && !this.nodes.has(this.root) && this.addNode(this.root, n(this.root), i(this.root), "source");
		let e = {
			nodes: [...this.nodes.values()],
			edges: [...this.edges.values()]
		};
		return this.root && (e.root = this.root), e;
	}
};
function s(e) {
	return e.replace(/^.*\//, "").startsWith("__");
}
function c(t, i) {
	let o = [];
	for (let c of e(i.split("\n"))) if (c.type === "open") {
		let { id: e, origin: i } = a(c.raw), l = o[o.length - 1];
		s(e) || (t.addNode(e, n(e), i, "log"), t.root ??= e, l && !s(l) && t.addEdge(l, e, r(e), "log")), o.push(e);
	} else c.type === "close" && o.pop();
}
function l(e, t) {
	for (let r of t) {
		if (!r || r.endsWith("/")) continue;
		let { id: t, origin: i } = a(r);
		t && (e.addNode(t, n(t), i, "fls"), e.root && e.addEdge(e.root, t, "reads", "fls"));
	}
}
function u(e, t) {
	for (let n of t) e.addNode(n, "font", "system", "xdv"), e.root && e.addEdge(e.root, n, "uses-font", "xdv");
}
var d = /\\documentclass(?:\[[^\]]*\])?\{([^}]+)\}/, f = /\\(?:usepackage|RequirePackage)(?:\[[^\]]*\])?\{([^}]+)\}/g, p = /\\(?:input|include|subfile)\{([^}]+)\}/g;
function m(e, t, r, i) {
	let a = t.trim();
	if (!a) return;
	let o = a.includes(".") ? a : `${a}.${r}`, s = i === "includes" ? "project" : "system";
	e.addNode(o, n(o), s, "source"), e.root && e.addEdge(e.root, o, i, "source");
}
function h(e, t) {
	e.root ??= "main.tex";
	let n = t.match(d);
	n && m(e, n[1], "cls", "loads");
	for (let n of t.matchAll(f)) for (let t of n[1].split(",")) m(e, t, "sty", "loads");
	for (let n of t.matchAll(p)) m(e, n[1], "tex", "includes");
}
function g(e, t = {}) {
	let n = new o();
	return c(n, e), t.source && h(n, t.source), t.inputFiles?.length && l(n, t.inputFiles), t.fonts?.length && u(n, t.fonts), n.build();
}
//#endregion
export { g as buildDependencyGraph };
