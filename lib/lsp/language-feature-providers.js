import { getCodeActions as e, getDocumentHighlights as t, getDocumentLinks as n, getFoldingRanges as r, getInlayHints as i, getSemanticTokens as a, getSignatureHelp as o } from "./language-features.js";
import * as s from "monaco-editor";
//#region src/lsp/language-feature-providers.ts
function c(e) {
	return new s.Range(e.startLine, e.startColumn, e.endLine, e.endColumn);
}
function l() {
	return {
		signatureHelpTriggerCharacters: [
			"{",
			"[",
			","
		],
		signatureHelpRetriggerCharacters: ["}", "]"],
		provideSignatureHelp(e, t) {
			let n = o(e.getValue(), t.lineNumber, t.column);
			return n ? {
				value: {
					signatures: [{
						label: n.label,
						parameters: n.parameters.map((e) => ({ label: e }))
					}],
					activeSignature: 0,
					activeParameter: n.activeParameter
				},
				dispose() {}
			} : null;
		}
	};
}
function u() {
	return { provideFoldingRanges(e) {
		return r(e.getValue()).map((e) => {
			let t = {
				start: e.startLine,
				end: e.endLine
			};
			return e.kind === "region" ? t.kind = s.languages.FoldingRangeKind.Region : e.kind === "comment" && (t.kind = s.languages.FoldingRangeKind.Comment), t;
		});
	} };
}
function d(e) {
	return { provideDocumentHighlights(n, r) {
		let i = n.uri.path.replace(/^\//, "");
		return t(i, r.lineNumber, r.column, e).map((e) => ({
			range: c(e),
			kind: s.languages.DocumentHighlightKind.Text
		}));
	} };
}
function f(e) {
	return { provideInlayHints(t) {
		return {
			hints: i(t.getValue(), e).map((e) => ({
				position: {
					lineNumber: e.line,
					column: e.column
				},
				label: e.label,
				kind: s.languages.InlayHintKind.Type,
				paddingLeft: !0
			})),
			dispose() {}
		};
	} };
}
function p() {
	return { provideLinks(e) {
		return { links: n(e.getValue()).map((t) => {
			let n = c(t.range);
			if (t.kind === "url") return {
				range: n,
				url: t.target
			};
			let r = e.uri.path.replace(/[^/]*$/, ""), i = /\.[^./]+$/.test(t.target) ? t.target : `${t.target}.tex`;
			return {
				range: n,
				url: s.Uri.file(`${r}${i}`)
			};
		}) };
	} };
}
var m = {
	tokenTypes: [
		"macro",
		"comment",
		"string",
		"operator"
	],
	tokenModifiers: []
}, h = {
	command: 0,
	comment: 1,
	verbatim: 2,
	math: 3
};
function g() {
	return {
		getLegend: () => m,
		provideDocumentSemanticTokens(e) {
			let t = a(e.getValue()), n = [], r = 0, i = 0;
			for (let e of t) {
				let t = e.line - 1, a = e.startColumn - 1, o = t - r, s = o === 0 ? a - i : a;
				n.push(o, s, e.length, h[e.type] ?? 0, 0), r = t, i = a;
			}
			return { data: new Uint32Array(n) };
		},
		releaseDocumentSemanticTokens() {}
	};
}
function _(t) {
	return { provideCodeActions(n, r) {
		let i = n.uri.path.replace(/^\//, "");
		return {
			actions: e(n.getValue(), i, r.startLineNumber, t).map((e) => v(e)),
			dispose() {}
		};
	} };
}
function v(e) {
	return {
		title: e.title,
		kind: "quickfix",
		edit: { edits: e.edits.map((e) => ({
			resource: s.Uri.file(`/${e.file}`),
			textEdit: {
				range: c(e.edit.range),
				text: e.edit.newText
			},
			versionId: void 0
		})) }
	};
}
//#endregion
export { _ as createCodeActionProvider, d as createDocumentHighlightProvider, u as createFoldingRangeProvider, f as createInlayHintsProvider, p as createLinkProvider, g as createSemanticTokensProvider, l as createSignatureHelpProvider };
