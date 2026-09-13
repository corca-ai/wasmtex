import { getCommandSignature as e } from "./package-db.js";
//#region src/lsp/wrap-catalog.ts
var t = (t, n, r = 0) => ({
	kind: "command",
	name: t,
	context: n,
	selectionArgument: r,
	arguments: e(t) ?? []
}), n = (e, t, n) => ({
	kind: "environment",
	name: e,
	context: t,
	selectionArgument: null,
	bodyContext: e === "equation" || t === "math" ? "math" : "text",
	arguments: [],
	...n ? { package: n } : {}
}), r = [
	...[
		"emph",
		"textbf",
		"textit",
		"texttt",
		"underline"
	].map((e) => t(e, "text")),
	...["mathrm", "mathbf"].map((e) => t(e, "math")),
	t("sqrt", "math", 1),
	t("frac", "math"),
	...[
		"quote",
		"quotation",
		"center",
		"flushleft",
		"flushright",
		"equation"
	].map((e) => n(e, "text")),
	n("aligned", "math", "amsmath")
];
function i(e, t) {
	let n = new Set(e.getCommandDefs(t).map((e) => e.name)), i = new Set(e.getEnvironmentDefinitions(t).map((e) => e.name)), a = e.getLoadedPackages(t);
	return r.filter((e) => (e.kind !== "command" || e.selectionArgument !== null && e.arguments[e.selectionArgument]?.kind === "required") && !i.has(e.name) && !n.has(e.name) && !n.has(`end${e.name}`) && (!e.package || a.has(e.package)));
}
function a(e) {
	return {
		kind: e.kind,
		name: e.name,
		selectionArgument: e.selectionArgument,
		arguments: e.arguments.map((e) => ({ ...e }))
	};
}
//#endregion
export { i as activeWrapDefinitions, a as publicWrapOption };
