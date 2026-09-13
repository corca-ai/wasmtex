import { CompletionSnapshotValidationError as e } from "./engine/completion-snapshot.js";
import { LatexLanguageService as t } from "./lsp.js";
import { RpcError as n, changeParams as r, documentParams as i, openParams as a, positionParams as o, text as s } from "./lsp/server-params.js";
//#region src/lsp-server.ts
var c = {
	text: 1,
	command: 3,
	variable: 6,
	module: 9,
	keyword: 14,
	file: 17,
	reference: 18
}, l = {
	error: 1,
	warning: 2,
	info: 3
};
function u(e, t) {
	return {
		line: e - 1,
		character: t - 1
	};
}
function d(e) {
	return {
		start: u(e.startLine, e.startColumn),
		end: u(e.endLine, e.endColumn)
	};
}
function f(e) {
	let t = e.replace(/^file:\/\//, "").replace(/^\//, "");
	try {
		return decodeURIComponent(t);
	} catch {
		return t;
	}
}
function p(e) {
	return `file:///${e.split("/").map(encodeURIComponent).join("/")}`;
}
var m = class {
	send;
	service;
	activeRequests = /* @__PURE__ */ new Map();
	constructor(e, n) {
		this.send = e, this.service = n instanceof t ? n : new t(n);
	}
	handle(t) {
		if (!t.method) return;
		let r = t.id;
		if (r != null && this.activeRequests.has(r)) {
			this.send({
				jsonrpc: "2.0",
				id: r,
				error: {
					code: -32600,
					message: "Request ID is already active"
				}
			});
			return;
		}
		let i = { cancelled: !1 };
		r != null && this.activeRequests.set(r, i);
		let a = (e) => {
			r != null && this.activeRequests.get(r) === i && (this.activeRequests.delete(r), this.send({
				jsonrpc: "2.0",
				id: r,
				...i.cancelled ? { error: {
					code: -32800,
					message: "Request cancelled"
				} } : e
			}));
		}, o = (t) => a({ error: {
			code: t instanceof n ? t.code : t instanceof e ? -32602 : -32603,
			message: t instanceof Error ? t.message : String(t)
		} });
		try {
			let e = this.dispatch(t);
			if (e instanceof Promise) return e.then((e) => a({ result: e ?? null }), o);
			a({ result: e ?? null });
		} catch (e) {
			o(e);
		}
	}
	dispatch(e) {
		let { method: t, params: r } = e;
		if (e.id != null && t?.startsWith("$/")) throw new n(-32601, `Unknown request method: ${t}`);
		switch (t) {
			case "initialize": return { capabilities: b() };
			case "initialized":
			case "exit":
			case "shutdown": return null;
			case "$/cancelRequest": {
				let e = r?.id;
				if (typeof e == "number" || typeof e == "string") {
					let t = this.activeRequests.get(e);
					t && (t.cancelled = !0);
				}
				return null;
			}
			case "textDocument/didOpen": return this.didOpen(r);
			case "textDocument/didChange": return this.didChange(r);
			case "textDocument/didClose": return this.didClose(r);
			case "textDocument/completion": return this.completion(o(r));
			case "textDocument/hover": return this.hover(o(r));
			case "textDocument/definition": return this.definition(o(r));
			case "textDocument/references": return this.references(o(r));
			case "textDocument/rename": return this.rename(r);
			case "wasmtex/updateCompletionSnapshot": return this.service.updateCompletionSnapshot(r?.snapshot);
			case "wasmtex/setMainFile": return this.service.setMainFile(s(r?.path, "path")), null;
			case "wasmtex/completionSnapshotState": return this.service.getCompletionSnapshotState();
			default: throw new n(-32601, `Unknown method: ${t}`);
		}
	}
	didOpen(e) {
		let t = a(e);
		this.service.updateDocument({
			fileId: t.uri,
			path: f(t.uri),
			content: t.text,
			documentVersion: t.version,
			language: t.languageId === "markdown" ? "markdown" : "latex"
		}), this.publishAllDiagnostics();
	}
	didChange(e) {
		let t = r(e);
		if (t.content === void 0) return;
		let n = f(t.uri);
		this.service.updateDocument({
			fileId: t.uri,
			path: n,
			content: t.content,
			documentVersion: t.version,
			language: /\.md$/i.test(n) ? "markdown" : "latex"
		}), this.publishAllDiagnostics();
	}
	didClose(e) {
		this.service.removeDocument(i(e).uri), this.publishAllDiagnostics();
	}
	completion(e) {
		let { path: t, line: n, column: r } = h(e), i = this.service.getCompletionResult(t, n, r), a = (t) => ({
			isIncomplete: t.isIncomplete,
			items: t.items.map((t) => g(t, e.position))
		});
		return i.isIncomplete ? this.service.getCompletionResultAsync(t, n, r).then(a) : a(i);
	}
	hover(e) {
		let { path: t, line: n, column: r } = h(e), i = this.service.getHover(t, n, r);
		return i ? _(i) : null;
	}
	definition(e) {
		let { path: t, line: n, column: r } = h(e), i = this.service.getDefinition(t, n, r);
		return i ? v(i) : null;
	}
	references(e) {
		let { path: t, line: n, column: r } = h(e);
		return this.service.getReferences(t, n, r).map(v);
	}
	rename(e) {
		let { path: t, line: n, column: r } = h(o(e)), i = s(e?.newName, "newName"), a = this.service.getRenameEdits(t, n, r, i);
		if (!a) return null;
		let c = {};
		for (let e of a.edits) {
			let t = p(e.file), n = c[t] ?? [];
			c[t] = n, n.push({
				range: {
					start: u(e.range.startLineNumber, e.range.startColumn),
					end: u(e.range.endLineNumber, e.range.endColumn)
				},
				newText: e.newText
			});
		}
		return { changes: c };
	}
	publishedUris = /* @__PURE__ */ new Set();
	publishAllDiagnostics() {
		let e = /* @__PURE__ */ new Map();
		for (let t of this.service.getDiagnostics()) {
			let n = p(t.file), r = e.get(n) ?? [];
			r.push(y(t)), e.set(n, r);
		}
		let t = new Set(this.publishedUris);
		for (let n of e.keys()) t.add(n);
		this.publishedUris = new Set(e.keys());
		for (let n of t) this.send({
			jsonrpc: "2.0",
			method: "textDocument/publishDiagnostics",
			params: {
				uri: n,
				diagnostics: e.get(n) ?? []
			}
		});
	}
};
function h(e) {
	return {
		path: f(e.textDocument.uri),
		line: e.position.line + 1,
		column: e.position.character + 1
	};
}
function g(e, t) {
	let n = e.replacementRange ? d(e.replacementRange) : {
		start: {
			line: t.line,
			character: Math.max(0, t.character - e.replaceLength)
		},
		end: t
	}, r = {
		label: e.label,
		kind: c[e.kind],
		insertTextFormat: e.snippet ? 2 : 1,
		textEdit: {
			range: n,
			newText: e.insertText
		}
	};
	return e.detail && (r.detail = e.detail), e.documentation && (r.documentation = e.documentation), e.sortText && (r.sortText = e.sortText), e.data && (r.data = e.data), r;
}
function _(e) {
	return {
		contents: {
			kind: "markdown",
			value: e.contents.join("\n\n")
		},
		range: d(e.range)
	};
}
function v(e) {
	return {
		uri: p(e.file),
		range: d(e.range)
	};
}
function y(e) {
	return {
		range: {
			start: u(e.line, e.column),
			end: u(e.line, e.endColumn)
		},
		severity: l[e.severity],
		code: e.code,
		message: e.message,
		source: "wasmtex"
	};
}
function b() {
	return {
		textDocumentSync: 1,
		completionProvider: { triggerCharacters: [
			"\\",
			"{",
			"[",
			",",
			"=",
			"@"
		] },
		hoverProvider: !0,
		definitionProvider: !0,
		referencesProvider: !0,
		renameProvider: !0
	};
}
//#endregion
export { m as LatexLspServer, f as pathFromUri, p as uriFromPath };
