import { ENVIRONMENT_NAME_PATTERN as e, linkedEnvironmentRanges as t } from "./environment-pairs.js";
import { CompletionResolverRegistry as n } from "./completion-registry.js";
import { projectCommandMetadata as r } from "./project-command-metadata.js";
import { getCodeActions as i, getDocumentHighlights as a, getDocumentLinks as o, getFoldingRanges as s, getInlayHints as c, getSemanticTokens as l, getSignatureHelp as u } from "./language-features.js";
import * as d from "monaco-editor";
//#region src/lsp/language-feature-providers.ts
function f(e) {
	return new d.Range(e.startLine, e.startColumn, e.endLine, e.endColumn);
}
function p(e, t = new n()) {
	return {
		signatureHelpTriggerCharacters: [
			"{",
			"[",
			","
		],
		signatureHelpRetriggerCharacters: ["}", "]"],
		provideSignatureHelp(n, i) {
			let a = e ? r(e, n.uri.path.replace(/^\//, ""), t) : t, o = u(n.getValue(), i.lineNumber, i.column, a);
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
function m() {
	return { provideFoldingRanges(e) {
		return s(e.getValue()).map((e) => {
			let t = {
				start: e.startLine,
				end: e.endLine
			};
			return e.kind === "region" ? t.kind = d.languages.FoldingRangeKind.Region : e.kind === "comment" && (t.kind = d.languages.FoldingRangeKind.Comment), t;
		});
	} };
}
function h(e) {
	return { provideDocumentHighlights(t, n) {
		let r = t.uri.path.replace(/^\//, "");
		return a(r, n.lineNumber, n.column, e).map((e) => ({
			range: f(e),
			kind: d.languages.DocumentHighlightKind.Text
		}));
	} };
}
function g(e) {
	return { provideInlayHints(t) {
		return {
			hints: c(t.getValue(), e).map((e) => ({
				position: {
					lineNumber: e.line,
					column: e.column
				},
				label: e.label,
				kind: d.languages.InlayHintKind.Type,
				paddingLeft: !0
			})),
			dispose() {}
		};
	} };
}
function _() {
	return { provideLinks(e) {
		return { links: o(e.getValue()).map((t) => {
			let n = f(t.range);
			if (t.kind === "url") return {
				range: n,
				url: t.target
			};
			let r = e.uri.path.replace(/[^/]*$/, ""), i = /\.[^./]+$/.test(t.target) ? t.target : `${t.target}.tex`;
			return {
				range: n,
				url: d.Uri.file(`${r}${i}`)
			};
		}) };
	} };
}
var v = {
	tokenTypes: [
		"macro",
		"comment",
		"string",
		"operator"
	],
	tokenModifiers: []
}, y = {
	command: 0,
	comment: 1,
	verbatim: 2,
	math: 3
};
function b() {
	return {
		getLegend: () => v,
		provideDocumentSemanticTokens(e) {
			let t = l(e.getValue()), n = [], r = 0, i = 0;
			for (let e of t) {
				let t = e.line - 1, a = e.startColumn - 1, o = t - r, s = o === 0 ? a - i : a;
				n.push(o, s, e.length, y[e.type] ?? 0, 0), r = t, i = a;
			}
			return { data: new Uint32Array(n) };
		},
		releaseDocumentSemanticTokens() {}
	};
}
function x(e) {
	return { provideCodeActions(t, n) {
		let r = t.uri.path.replace(/^\//, "");
		return {
			actions: i(t.getValue(), r, n.startLineNumber, e).map((e) => S(e)),
			dispose() {}
		};
	} };
}
function S(e) {
	return {
		title: e.title,
		kind: "quickfix",
		edit: { edits: e.edits.map((e) => ({
			resource: d.Uri.file(`/${e.file}`),
			textEdit: {
				range: f(e.edit.range),
				text: e.edit.newText
			},
			versionId: void 0
		})) }
	};
}
function C(n, r) {
	return { provideLinkedEditingRanges(i, a, o) {
		let s = i.uri.path.replace(/^\//, "");
		if (o.isCancellationRequested || r.readFile(s) !== i.getValue()) return null;
		let c = t(n.getFileSymbols(s)?.environmentNamePairs ?? [], a.lineNumber, a.column);
		return c ? {
			ranges: c.map(f),
			wordPattern: new RegExp(e)
		} : null;
	} };
}
//#endregion
export { x as createCodeActionProvider, h as createDocumentHighlightProvider, m as createFoldingRangeProvider, g as createInlayHintsProvider, _ as createLinkProvider, C as createLinkedEditingRangeProvider, b as createSemanticTokensProvider, p as createSignatureHelpProvider };
