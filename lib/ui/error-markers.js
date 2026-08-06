import { clampMarkerRange as e } from "./marker-range.js";
import * as t from "monaco-editor";
//#region src/ui/error-markers.ts
function n(e, n, r, i, a) {
	let o = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = n(t);
		if (!e) continue;
		let r = o.get(e) ?? [];
		r.push(t), o.set(e, r);
	}
	for (let e of i) {
		let n = e.uri.path.startsWith("/") ? e.uri.path.slice(1) : e.uri.path, i = (o.get(n) ?? []).map((t) => a(t, e));
		t.editor.setModelMarkers(e, r, i);
	}
}
function r(n, r) {
	return {
		severity: n.severity === "error" ? t.MarkerSeverity.Error : t.MarkerSeverity.Warning,
		...e(n.line, 1, Infinity, r.getLineCount(), (e) => r.getLineMaxColumn(e)),
		message: n.message,
		source: "TeX",
		...n.code ? { code: n.code } : {}
	};
}
function i(e, t) {
	n(e, (e) => e.file && e.line > 0 ? e.file : void 0, "tex", t, (e, t) => r(e, t));
}
var a = {
	error: t.MarkerSeverity.Error,
	warning: t.MarkerSeverity.Warning,
	info: t.MarkerSeverity.Info
};
function o(t, r) {
	n(t, (e) => e.file, "latex-diagnostics", r, (t, n) => ({
		severity: a[t.severity],
		...e(t.line, t.column, t.endColumn, n.getLineCount(), (e) => n.getLineMaxColumn(e)),
		message: t.message,
		source: "LaTeX",
		code: t.code
	}));
}
//#endregion
export { r as errorToMarker, o as setDiagnosticMarkers, i as setErrorMarkers };
