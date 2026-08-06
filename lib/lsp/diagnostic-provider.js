//#region src/lsp/diagnostic-provider.ts
function e(e) {
	let r = [];
	return n(e, r), i(e, r), t(e, r), a(e, r), o(e, r), l(e, r), u(e, r), r;
}
function t(e, t) {
	let n = e.getBibEntries();
	if (n.length === 0) return;
	let r = new Set(e.getAuxCitations());
	for (let t of e.getFiles()) {
		let n = e.getFileSymbols(t);
		if (n) for (let e of n.citations) r.add(e.key);
	}
	if (!r.has("*")) for (let e of n) r.has(e.key) || t.push({
		file: e.location.file,
		line: e.location.line,
		column: e.location.column,
		endColumn: e.location.column + e.key.length,
		message: `Unused bibliography entry '${e.key}'`,
		severity: "info",
		code: "unused-bib-entry"
	});
}
function n(e, t) {
	let n = new Set(e.getAllLabels().map((e) => e.name)), r = e.getAuxLabels(), i = e.getSemanticTrace();
	for (let a of e.getFiles()) {
		let o = e.getFileSymbols(a);
		if (o) for (let e of o.labelRefs) i?.labels.has(e.name) || !n.has(e.name) && !r.has(e.name) && t.push({
			file: a,
			line: e.location.line,
			column: e.location.column,
			endColumn: e.location.column + e.name.length,
			message: `Undefined reference '${e.name}'`,
			severity: "warning",
			code: "undefined-ref"
		});
	}
}
function r(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e.getFiles()) {
		let r = e.getFileSymbols(n);
		if (r) for (let e of r.bibItems) t.add(e.key);
	}
	return t;
}
function i(e, t) {
	let n = e.getAuxCitations(), i = new Set(e.getBibEntries().map((e) => e.key)), a = r(e);
	for (let r of e.getFiles()) {
		let o = e.getFileSymbols(r);
		if (o) for (let e of o.citations) e.key !== "*" && (n.has(e.key) || i.has(e.key) || a.has(e.key) || t.push({
			file: r,
			line: e.location.line,
			column: e.location.column,
			endColumn: e.location.column + e.key.length,
			message: `Undefined citation '${e.key}'`,
			severity: "warning",
			code: "undefined-cite"
		}));
	}
}
function a(e, t) {
	let n = e.getAllLabels(), r = /* @__PURE__ */ new Map();
	for (let e of n) {
		let n = r.get(e.name);
		n ? t.push({
			file: e.location.file,
			line: e.location.line,
			column: e.location.column,
			endColumn: e.location.column + e.name.length,
			message: `Duplicate label '${e.name}' (first defined at ${n.file}:${n.line})`,
			severity: "warning",
			code: "duplicate-label"
		}) : r.set(e.name, {
			file: e.location.file,
			line: e.location.line
		});
	}
}
function o(e, t) {
	let n = /* @__PURE__ */ new Set();
	for (let t of e.getFiles()) {
		let r = e.getFileSymbols(t);
		if (r) for (let e of r.labelRefs) n.add(e.name);
	}
	let r = e.getSemanticTrace();
	if (r) for (let e of r.refs) n.add(e);
	for (let r of e.getAllLabels()) n.has(r.name) || t.push({
		file: r.location.file,
		line: r.location.line,
		column: r.location.column,
		endColumn: r.location.column + r.name.length,
		message: `Label '${r.name}' is never referenced`,
		severity: "info",
		code: "unreferenced-label"
	});
}
function s(e) {
	return /\.[^./]+$/.test(e) ? [e] : [e, `${e}.tex`];
}
function c(e, t, n) {
	return s(t).some((t) => !!(e.getFileSymbols(t) || n && e.getFileSymbols(n + t)));
}
function l(e, t) {
	for (let n of e.getFiles()) {
		let r = e.getFileSymbols(n);
		if (!r) continue;
		let i = n.lastIndexOf("/"), a = i >= 0 ? n.slice(0, i + 1) : "";
		for (let i of r.includes) {
			if (c(e, i.path, a)) continue;
			let r = /\.[^./]+$/.test(i.path) ? i.path : `${i.path}.tex`;
			t.push({
				file: n,
				line: i.location.line,
				column: i.location.column,
				endColumn: i.location.column + i.type.length + 2 + i.path.length,
				message: `Included file '${r}' not found in project`,
				severity: "warning",
				code: "missing-include"
			});
		}
	}
}
function u(e, t) {
	let n = e.getSemanticTrace();
	if (!n) return;
	let r = e.getFiles()[0];
	if (!r) return;
	let i = new Set(e.getAllLabels().map((e) => e.name)), a = /* @__PURE__ */ new Set();
	for (let t of e.getFiles()) {
		let n = e.getFileSymbols(t);
		if (n) for (let e of n.labelRefs) a.add(e.name);
	}
	for (let o of n.labels) i.has(o) || e.getAuxLabels().has(o) || a.has(o) || n.refs.has(o) || t.push({
		file: r,
		line: 1,
		column: 1,
		endColumn: 1,
		message: `Label '${o}' defined by macro expansion (not visible in source)`,
		severity: "info",
		code: "engine-only-label"
	});
}
//#endregion
export { e as computeDiagnostics };
