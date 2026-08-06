import { ENV_CMDS as e, INPUT_CMDS as t, REF_CMDS as n } from "./latex-patterns.js";
import { sourceLocationToMonaco as r } from "./source-position-monaco.js";
//#region src/lsp/definition-provider.ts
function i(e, t) {
	let n = 0;
	for (let r = t - 1; r >= 0; r--) if (e[r] === "}") n++;
	else if (e[r] === "{") {
		if (n === 0) return r;
		n--;
	}
	return -1;
}
function a(e, t) {
	let n = 0;
	for (let r = t; r < e.length; r++) if (e[r] === "{") n++;
	else if (e[r] === "}" && (n--, n === 0)) return r;
	return e.length;
}
function o(e, t) {
	let n = 0;
	for (let r of e.split(",")) {
		let e = n + r.length;
		if (t >= n && t <= e) return r;
		n = e + 1;
	}
	return e;
}
function s(e, t) {
	let n = i(e, t);
	if (n < 0) return null;
	let r = e.slice(0, n).match(/\\([a-zA-Z@]+)(?:\[.*?\])?\s*$/);
	if (!r) return null;
	let s = a(e, n), c = o(e.slice(n + 1, s), t - (n + 1));
	return {
		command: r[1],
		arg: c
	};
}
var c = /^(?:cite|citep|citet|parencite|textcite|autocite|nocite)$/, l = RegExp(`^(?:${n}|cite|citep|citet|parencite|textcite|autocite|nocite|${t}|${e})$`);
function u(e, t) {
	let n = e.matchAll(/\\[a-zA-Z@]+/g);
	for (let r of n) {
		let n = r.index, i = n + r[0].length;
		if (t >= n && t < i) {
			let t = r[0].slice(1);
			if (l.test(t)) {
				let n = e.slice(i).match(/^\s*(?:\[.*?\])?\s*\{([^}]*)\}/);
				if (n) return {
					command: t,
					arg: o(n[1], 0)
				};
			}
			return { command: t };
		}
	}
	return null;
}
function d(e, t) {
	let n = e.getLineContent(t.lineNumber), r = t.column - 1;
	return s(n, r) ?? u(n, r);
}
var f = RegExp(`^(?:${n})$`), p = RegExp(`^(?:${t})$`), m = RegExp(`^(?:${e})$`);
function h(e, t, n) {
	let i = [e];
	/\.[^./]+$/.test(e) || i.push(`${e}.tex`);
	for (let e of i) if (t.hasFile(e)) return r({
		file: e,
		line: 1,
		column: 1
	});
	let a = n.uri.path.replace(/^\//, ""), o = a.lastIndexOf("/");
	if (o >= 0) {
		let e = a.slice(0, o + 1);
		for (let n of i) {
			let i = e + n;
			if (t.hasFile(i)) return r({
				file: i,
				line: 1,
				column: 1
			});
		}
	}
	return r({
		file: i[i.length - 1],
		line: 1,
		column: 1
	});
}
function g(e, t, n, i) {
	let a = t.trim();
	if (f.test(e)) {
		let e = n.findLabelDef(a);
		return e ? r(e.location) : null;
	}
	if (c.test(e)) {
		let e = n.findBibEntry(a);
		if (e) return r(e.location);
		let t = n.findBibitemDef(a);
		return t ? r(t.location) : null;
	}
	if (p.test(e)) return h(a, n, i);
	if (m.test(e)) {
		let e = n.findEnvironmentDef(a);
		return e ? r(e.location) : null;
	}
	return null;
}
function _(e, t) {
	let n = t.findCommandDef(e);
	return n ? r(n.location) : null;
}
function v(e) {
	return { provideDefinition(t, n) {
		let r = d(t, n);
		return r ? "arg" in r ? g(r.command, r.arg, e, t) : _(r.command, e) : null;
	} };
}
//#endregion
export { v as createDefinitionProvider };
