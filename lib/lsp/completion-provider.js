import { provideCompletionResultAsync as e } from "./neutral-providers.js";
import { modelToDoc as t } from "./monaco-doc.js";
import * as n from "monaco-editor";
//#region src/lsp/completion-provider.ts
var r = n.languages.CompletionItemKind, i = {
	command: r.Function,
	reference: r.Reference,
	module: r.Module,
	file: r.File,
	keyword: r.Keyword,
	text: r.Text,
	variable: r.Variable
};
function a(e, t) {
	return {
		...e ? { cancellationToken: e } : {},
		...t ? { registry: t } : {}
	};
}
function o(e, t) {
	return {
		suggestions: e.items.map((e) => c(e, t)),
		incomplete: e.isIncomplete
	};
}
function s(n, r, i) {
	return {
		triggerCharacters: [
			"\\",
			"{",
			"[",
			",",
			"=",
			"@"
		],
		async provideCompletionItems(s, c, l, u) {
			return u?.isCancellationRequested ? { suggestions: [] } : o(await e(t(s), {
				line: c.lineNumber,
				column: c.column
			}, n, r, a(u, i)), c);
		}
	};
}
function c(e, t) {
	let r = e.replacementRange, a = {
		label: e.label,
		kind: i[e.kind],
		insertText: e.insertText,
		range: r ? {
			startLineNumber: r.startLine,
			startColumn: r.startColumn,
			endLineNumber: r.endLine,
			endColumn: r.endColumn
		} : {
			startLineNumber: t.lineNumber,
			startColumn: t.column - e.replaceLength,
			endLineNumber: t.lineNumber,
			endColumn: t.column
		}
	};
	return e.snippet && (a.insertTextRules = n.languages.CompletionItemInsertTextRule.InsertAsSnippet), e.detail && (a.detail = e.detail), e.documentation && (a.documentation = { value: e.documentation }), e.sortText && (a.sortText = e.sortText), e.data && (a.data = e.data), a;
}
//#endregion
export { s as createAsyncCompletionProvider };
