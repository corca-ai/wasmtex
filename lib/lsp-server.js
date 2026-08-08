import { LatexLanguageService as e } from "./lsp.js";
//#region src/lsp-server.ts
var t = {
	text: 1,
	command: 3,
	variable: 6,
	module: 9,
	keyword: 14,
	file: 17,
	reference: 18
}, n = {
	error: 1,
	warning: 2,
	info: 3
};
function r(e, t) {
	return {
		line: e - 1,
		character: t - 1
	};
}
function i(e) {
	return {
		start: r(e.startLine, e.startColumn),
		end: r(e.endLine, e.endColumn)
	};
}
function a(e) {
	let t = e.replace(/^file:\/\//, "").replace(/^\//, "");
	try {
		return decodeURIComponent(t);
	} catch {
		return t;
	}
}
function o(e) {
	return `file:///${e.split("/").map(encodeURIComponent).join("/")}`;
}
var s = class {
	send;
	service;
	cancelledRequests = /* @__PURE__ */ new Set();
	constructor(t, n) {
		this.send = t, this.service = n instanceof e ? n : new e(n);
	}
	handle(e) {
		if (e.method) try {
			let t = this.dispatch(e);
			if (t) return t.catch((t) => this.respondDispatchError(e, t));
		} catch (t) {
			this.respondDispatchError(e, t);
		}
	}
	dispatch(e) {
		let { id: t, method: n, params: r } = e, i = r;
		switch (n) {
			case "initialize":
				this.respond(t, { capabilities: p() });
				break;
			case "initialized":
			case "exit": break;
			case "shutdown":
				this.respond(t, null);
				break;
			case "$/cancelRequest": {
				let e = r?.id;
				(typeof e == "number" || typeof e == "string") && this.cancelledRequests.add(e);
				break;
			}
			case "textDocument/didOpen":
				this.didOpen(r);
				break;
			case "textDocument/didChange":
				this.didChange(r);
				break;
			case "textDocument/didClose":
				this.didClose(r);
				break;
			case "textDocument/completion":
				{
					let e = this.completion(i);
					if (e instanceof Promise) return e.then((e) => this.respond(t, e));
					this.respond(t, e);
				}
				break;
			case "textDocument/hover":
				this.respond(t, this.hover(i));
				break;
			case "textDocument/definition":
				this.respond(t, this.definition(i));
				break;
			case "textDocument/references":
				this.respond(t, this.references(i));
				break;
			case "textDocument/rename":
				this.respond(t, this.rename(r));
				break;
			case "wasmtex/updateCompletionSnapshot": return this.service.updateCompletionSnapshot(r?.snapshot).then((e) => this.respond(t, e));
			case "wasmtex/setMainFile":
				this.service.setMainFile(String(r?.path ?? "")), this.respond(t, null);
				break;
			case "wasmtex/completionSnapshotState":
				this.respond(t, this.service.getCompletionSnapshotState());
				break;
			default: t != null && this.respondError(t, -32601, `Unknown method: ${n}`);
		}
	}
	respondDispatchError(e, t) {
		if (e.id == null) return;
		let n = t instanceof Error ? t.message : String(t);
		this.respondError(e.id, -32603, `Internal error: ${n}`);
	}
	respond(e, t) {
		e != null && (this.cancelledRequests.delete(e) || this.send({
			jsonrpc: "2.0",
			id: e,
			result: t
		}));
	}
	respondError(e, t, n) {
		this.send({
			jsonrpc: "2.0",
			id: e,
			error: {
				code: t,
				message: n
			}
		});
	}
	didOpen(e) {
		let t = e?.textDocument ?? {};
		this.service.updateDocument({
			fileId: t.uri,
			path: a(t.uri),
			content: t.text ?? "",
			documentVersion: t.version ?? 0,
			language: t.languageId === "markdown" ? "markdown" : "latex"
		}), this.publishAllDiagnostics();
	}
	didChange(e) {
		let t = e?.textDocument ?? {}, n = e?.contentChanges ?? [];
		if (!n.length) return;
		let r = a(t.uri);
		this.service.updateDocument({
			fileId: t.uri,
			path: r,
			content: n[n.length - 1].text,
			documentVersion: t.version ?? 0,
			language: /\.md$/i.test(r) ? "markdown" : "latex"
		}), this.publishAllDiagnostics();
	}
	didClose(e) {
		let t = e?.textDocument ?? {};
		t.uri && (this.service.removeDocument(t.uri), this.publishAllDiagnostics());
	}
	completion(e) {
		let { path: t, line: n, column: r } = c(e), i = this.service.getCompletionResult(t, n, r), a = (t) => ({
			isIncomplete: t.isIncomplete,
			items: t.items.map((t) => l(t, e.position))
		});
		return i.isIncomplete ? this.service.getCompletionResultAsync(t, n, r).then(a) : a(i);
	}
	hover(e) {
		let { path: t, line: n, column: r } = c(e), i = this.service.getHover(t, n, r);
		return i ? u(i) : null;
	}
	definition(e) {
		let { path: t, line: n, column: r } = c(e), i = this.service.getDefinition(t, n, r);
		return i ? d(i) : null;
	}
	references(e) {
		let { path: t, line: n, column: r } = c(e);
		return this.service.getReferences(t, n, r).map(d);
	}
	rename(e) {
		let t = e?.textDocument ?? {}, n = e?.position ?? {
			line: 0,
			character: 0
		}, i = String(e?.newName ?? ""), s = this.service.getRenameEdits(a(t.uri), n.line + 1, n.character + 1, i);
		if (!s) return null;
		let c = {};
		for (let e of s.edits) {
			let t = o(e.file), n = c[t] ?? [];
			c[t] = n, n.push({
				range: {
					start: r(e.range.startLineNumber, e.range.startColumn),
					end: r(e.range.endLineNumber, e.range.endColumn)
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
			let n = o(t.file), r = e.get(n) ?? [];
			r.push(f(t)), e.set(n, r);
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
function c(e) {
	return {
		path: a(e.textDocument.uri),
		line: e.position.line + 1,
		column: e.position.character + 1
	};
}
function l(e, n) {
	let r = e.replacementRange ? i(e.replacementRange) : {
		start: {
			line: n.line,
			character: Math.max(0, n.character - e.replaceLength)
		},
		end: n
	}, a = {
		label: e.label,
		kind: t[e.kind],
		insertTextFormat: e.snippet ? 2 : 1,
		textEdit: {
			range: r,
			newText: e.insertText
		}
	};
	return e.detail && (a.detail = e.detail), e.documentation && (a.documentation = e.documentation), e.sortText && (a.sortText = e.sortText), e.data && (a.data = e.data), a;
}
function u(e) {
	return {
		contents: {
			kind: "markdown",
			value: e.contents.join("\n\n")
		},
		range: i(e.range)
	};
}
function d(e) {
	return {
		uri: o(e.file),
		range: i(e.range)
	};
}
function f(e) {
	return {
		range: {
			start: r(e.line, e.column),
			end: r(e.line, e.endColumn)
		},
		severity: n[e.severity],
		code: e.code,
		message: e.message,
		source: "wasmtex"
	};
}
function p() {
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
export { s as LatexLspServer, a as pathFromUri, o as uriFromPath };
