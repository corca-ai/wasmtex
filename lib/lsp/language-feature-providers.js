import { ENVIRONMENT_NAME_PATTERN as e, linkedEnvironmentRanges as t } from "./environment-pairs.js";
import { getStructuralSelectionIndex as n, structuralSelectionRanges as r } from "./structural-selection.js";
import { CompletionResolverRegistry as i } from "./completion-registry.js";
import { projectCommandMetadata as a } from "./project-command-metadata.js";
import { getCodeActions as o, getDocumentHighlights as s, getDocumentLinks as c, getFoldingRanges as l, getInlayHints as u, getSemanticTokens as d, getSignatureHelp as f } from "./language-features.js";
import * as p from "monaco-editor";
//#region src/lsp/language-feature-providers.ts
function m(e) {
	return new p.Range(e.startLine, e.startColumn, e.endLine, e.endColumn);
}
function h(e, t = new i()) {
	return {
		signatureHelpTriggerCharacters: [
			"{",
			"[",
			","
		],
		signatureHelpRetriggerCharacters: ["}", "]"],
		provideSignatureHelp(n, r) {
			let i = e ? a(e, n.uri.path.replace(/^\//, ""), t) : t, o = f(n.getValue(), r.lineNumber, r.column, i);
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
function g() {
	return { provideFoldingRanges(e) {
		return l(e.getValue()).map((e) => {
			let t = {
				start: e.startLine,
				end: e.endLine
			};
			return e.kind === "region" ? t.kind = p.languages.FoldingRangeKind.Region : e.kind === "comment" && (t.kind = p.languages.FoldingRangeKind.Comment), t;
		});
	} };
}
function _(e) {
	return { provideDocumentHighlights(t, n) {
		let r = t.uri.path.replace(/^\//, "");
		return s(r, n.lineNumber, n.column, e).map((e) => ({
			range: m(e),
			kind: p.languages.DocumentHighlightKind.Text
		}));
	} };
}
function v(e) {
	return { provideInlayHints(t) {
		return {
			hints: u(t.getValue(), e).map((e) => ({
				position: {
					lineNumber: e.line,
					column: e.column
				},
				label: e.label,
				kind: p.languages.InlayHintKind.Type,
				paddingLeft: !0
			})),
			dispose() {}
		};
	} };
}
function y() {
	return { provideLinks(e) {
		return { links: c(e.getValue()).map((t) => {
			let n = m(t.range);
			if (t.kind === "url") return {
				range: n,
				url: t.target
			};
			let r = e.uri.path.replace(/[^/]*$/, ""), i = /\.[^./]+$/.test(t.target) ? t.target : `${t.target}.tex`;
			return {
				range: n,
				url: p.Uri.file(`${r}${i}`)
			};
		}) };
	} };
}
var b = {
	tokenTypes: [
		"macro",
		"comment",
		"string",
		"operator"
	],
	tokenModifiers: []
}, x = {
	command: 0,
	comment: 1,
	verbatim: 2,
	math: 3
};
function S() {
	return {
		getLegend: () => b,
		provideDocumentSemanticTokens(e) {
			let t = d(e.getValue()), n = [], r = 0, i = 0;
			for (let e of t) {
				let t = e.line - 1, a = e.startColumn - 1, o = t - r, s = o === 0 ? a - i : a;
				n.push(o, s, e.length, x[e.type] ?? 0, 0), r = t, i = a;
			}
			return { data: new Uint32Array(n) };
		},
		releaseDocumentSemanticTokens() {}
	};
}
function C(e) {
	return { provideCodeActions(t, n) {
		let r = t.uri.path.replace(/^\//, "");
		return {
			actions: o(t.getValue(), r, n.startLineNumber, e).map((e) => w(e)),
			dispose() {}
		};
	} };
}
function w(e) {
	return {
		title: e.title,
		kind: "quickfix",
		edit: { edits: e.edits.map((e) => ({
			resource: p.Uri.file(`/${e.file}`),
			textEdit: {
				range: m(e.edit.range),
				text: e.edit.newText
			},
			versionId: void 0
		})) }
	};
}
function T(n, r) {
	return { provideLinkedEditingRanges(i, a, o) {
		let s = i.uri.path.replace(/^\//, "");
		if (o.isCancellationRequested || r.readFile(s) !== i.getValue()) return null;
		let c = t(n.getFileSymbols(s)?.environmentNamePairs ?? [], a.lineNumber, a.column);
		return c ? {
			ranges: c.map(m),
			wordPattern: new RegExp(e)
		} : null;
	} };
}
function E(e, t, o = new i()) {
	return { provideSelectionRanges(i, s, c) {
		let l = i.uri.path.replace(/^\//, "");
		if (c.isCancellationRequested || t.readFile(l) !== i.getValue()) return s.map(() => []);
		let u = a(e, l, o), d = n(e.getFileSymbols(l));
		return s.map((e) => r(d, e.lineNumber, e.column, u, c).map((e) => ({ range: m(e) })));
	} };
}
//#endregion
export { C as createCodeActionProvider, _ as createDocumentHighlightProvider, g as createFoldingRangeProvider, v as createInlayHintsProvider, y as createLinkProvider, T as createLinkedEditingRangeProvider, E as createSelectionRangeProvider, S as createSemanticTokensProvider, h as createSignatureHelpProvider };
