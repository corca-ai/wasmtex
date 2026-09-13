import { CompletionResolverRegistry as e } from "./completion-registry.js";
import { projectCommandMetadata as t } from "./project-command-metadata.js";
import { getCodeActions as n, getDocumentHighlights as r, getDocumentLinks as i, getFoldingRanges as a, getInlayHints as o, getSemanticTokens as s, getSignatureHelp as c } from "./language-features.js";
import * as l from "monaco-editor";
//#region src/lsp/language-feature-providers.ts
function u(e) {
	return new l.Range(e.startLine, e.startColumn, e.endLine, e.endColumn);
}
function d(n, r = new e()) {
	return {
		signatureHelpTriggerCharacters: [
			"{",
			"[",
			","
		],
		signatureHelpRetriggerCharacters: ["}", "]"],
		provideSignatureHelp(e, i) {
			let a = n ? t(n, e.uri.path.replace(/^\//, ""), r) : r, o = c(e.getValue(), i.lineNumber, i.column, a);
			return o ? {
				value: {
					signatures: [{
						label: o.label,
						parameters: o.parameters.map((e) => ({ label: e }))
					}],
					activeSignature: 0,
					activeParameter: o.activeParameter
				},
				dispose() {}
			} : null;
		}
	};
}
function f() {
	return { provideFoldingRanges(e) {
		return a(e.getValue()).map((e) => {
			let t = {
				start: e.startLine,
				end: e.endLine
			};
			return e.kind === "region" ? t.kind = l.languages.FoldingRangeKind.Region : e.kind === "comment" && (t.kind = l.languages.FoldingRangeKind.Comment), t;
		});
	} };
}
function p(e) {
	return { provideDocumentHighlights(t, n) {
		let i = t.uri.path.replace(/^\//, "");
		return r(i, n.lineNumber, n.column, e).map((e) => ({
			range: u(e),
			kind: l.languages.DocumentHighlightKind.Text
		}));
	} };
}
function m(e) {
	return { provideInlayHints(t) {
		return {
			hints: o(t.getValue(), e).map((e) => ({
				position: {
					lineNumber: e.line,
					column: e.column
				},
				label: e.label,
				kind: l.languages.InlayHintKind.Type,
				paddingLeft: !0
			})),
			dispose() {}
		};
	} };
}
function h() {
	return { provideLinks(e) {
		return { links: i(e.getValue()).map((t) => {
			let n = u(t.range);
			if (t.kind === "url") return {
				range: n,
				url: t.target
			};
			let r = e.uri.path.replace(/[^/]*$/, ""), i = /\.[^./]+$/.test(t.target) ? t.target : `${t.target}.tex`;
			return {
				range: n,
				url: l.Uri.file(`${r}${i}`)
			};
		}) };
	} };
}
var g = {
	tokenTypes: [
		"macro",
		"comment",
		"string",
		"operator"
	],
	tokenModifiers: []
}, _ = {
	command: 0,
	comment: 1,
	verbatim: 2,
	math: 3
};
function v() {
	return {
		getLegend: () => g,
		provideDocumentSemanticTokens(e) {
			let t = s(e.getValue()), n = [], r = 0, i = 0;
			for (let e of t) {
				let t = e.line - 1, a = e.startColumn - 1, o = t - r, s = o === 0 ? a - i : a;
				n.push(o, s, e.length, _[e.type] ?? 0, 0), r = t, i = a;
			}
			return { data: new Uint32Array(n) };
		},
		releaseDocumentSemanticTokens() {}
	};
}
function y(e) {
	return { provideCodeActions(t, r) {
		let i = t.uri.path.replace(/^\//, "");
		return {
			actions: n(t.getValue(), i, r.startLineNumber, e).map((e) => b(e)),
			dispose() {}
		};
	} };
}
function b(e) {
	return {
		title: e.title,
		kind: "quickfix",
		edit: { edits: e.edits.map((e) => ({
			resource: l.Uri.file(`/${e.file}`),
			textEdit: {
				range: u(e.edit.range),
				text: e.edit.newText
			},
			versionId: void 0
		})) }
	};
}
//#endregion
export { y as createCodeActionProvider, p as createDocumentHighlightProvider, f as createFoldingRangeProvider, m as createInlayHintsProvider, h as createLinkProvider, v as createSemanticTokensProvider, d as createSignatureHelpProvider };
