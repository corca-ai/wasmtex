//#region src/lsp/server-params.ts
var e = class extends Error {
	code;
	constructor(e, t) {
		super(t), this.code = e;
	}
};
function t(t, n) {
	if (!t || typeof t != "object" || Array.isArray(t)) throw new e(-32602, `${n} must be an object`);
	return t;
}
function n(t, n, r = !1) {
	if (typeof t != "string" || !r && !t.trim()) throw new e(-32602, `${n} must be a string${r ? "" : " (nonempty)"}`);
	return t;
}
function r(t, n, r = 0) {
	if (typeof t != "number" || !Number.isInteger(t) || t < r || t > 2147483647) throw new e(-32602, `${n} must be an integer in [${r}, 2147483647]`);
	return t;
}
function i(e) {
	let i = t(e?.textDocument, "textDocument");
	return {
		uri: n(i.uri, "textDocument.uri"),
		version: i.version === void 0 ? 0 : r(i.version, "textDocument.version", -2147483648)
	};
}
function a(e) {
	let { uri: n } = i(e), a = t(e?.position, "position");
	return {
		textDocument: { uri: n },
		position: {
			line: r(a.line, "position.line"),
			character: r(a.character, "position.character")
		}
	};
}
function o(e) {
	let r = t(e?.textDocument, "textDocument");
	return {
		...i(e),
		text: n(r.text, "textDocument.text", !0),
		languageId: r.languageId === void 0 ? "latex" : n(r.languageId, "textDocument.languageId")
	};
}
function s(r) {
	let a = i(r);
	if (!Array.isArray(r?.contentChanges)) throw new e(-32602, "contentChanges must be an array");
	let o = r.contentChanges.map((r) => {
		let i = t(r, "content change");
		if (i.range !== void 0) throw new e(-32602, "Only full document sync is supported");
		return n(i.text, "content change text", !0);
	});
	return {
		...a,
		content: o.at(-1)
	};
}
//#endregion
export { e as RpcError, s as changeParams, i as documentParams, o as openParams, a as positionParams, t as record, n as text };
