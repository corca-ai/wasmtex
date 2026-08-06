import * as e from "monaco-editor";
//#region src/lsp/symbol-provider.ts
var t = e.languages.SymbolKind, n = {
	part: 0,
	chapter: 1,
	section: 2,
	subsection: 3,
	subsubsection: 4,
	paragraph: 5
};
function r(t, n, r, i) {
	return {
		name: t,
		detail: n,
		kind: r,
		range: new e.Range(i, 1, i, 1),
		selectionRange: new e.Range(i, 1, i, 1),
		tags: [],
		children: []
	};
}
function i(e) {
	let n = [];
	for (let t of e.sections) n.push({
		line: t.location.line,
		type: "section",
		level: t.level,
		title: t.title
	});
	for (let i of e.labels) n.push({
		line: i.location.line,
		type: "other",
		sym: r(`\\label{${i.name}}`, "label", t.Key, i.location.line)
	});
	for (let i of e.commands) n.push({
		line: i.location.line,
		type: "other",
		sym: r(`\\${i.name}`, "command", t.Function, i.location.line)
	});
	for (let i of e.environments) n.push({
		line: i.location.line,
		type: "other",
		sym: r(i.name, "environment", t.Struct, i.location.line)
	});
	return n.sort((e, t) => e.line - t.line), n;
}
function a(e, t, n) {
	t.length > 0 ? t[t.length - 1].sym.children.push(e) : n.push(e);
}
function o(e) {
	let i = [], o = [];
	for (let s of e) if (s.type === "section") {
		let e = n[s.level], c = r(s.title, s.level, t.Module, s.line);
		for (; o.length > 0 && o[o.length - 1].depth >= e;) o.pop();
		a(c, o, i), o.push({
			sym: c,
			depth: e
		});
	} else a(s.sym, o, i);
	return i;
}
function s(e) {
	return { provideDocumentSymbols(t) {
		let n = t.uri.path.startsWith("/") ? t.uri.path.slice(1) : t.uri.path, r = e.getFileSymbols(n);
		return r ? o(i(r)) : [];
	} };
}
//#endregion
export { s as createDocumentSymbolProvider };
