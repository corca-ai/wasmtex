//#region src/engine/dependency-manifest.ts
var e = /* @__PURE__ */ new Set([
	"__strace.tex",
	"_checkpoint.tex",
	"_preamble.tex",
	"tail.tex",
	"texmf.cnf"
]);
function t(e) {
	let t = [];
	for (let n of e.split("/")) if (!(!n || n === ".")) if (n === "..") {
		if (t.length === 0) return null;
		t.pop();
	} else t.push(n);
	return t.length > 0 ? t.join("/") : null;
}
function n(e) {
	if (!e || e.includes("\0")) return null;
	let n = e.replaceAll("\\", "/");
	if (/^[A-Za-z]:\//.test(n) || n === "/work") return null;
	if (n.startsWith("/work/")) n = n.slice(6);
	else if (n.startsWith("/")) return null;
	return t(n);
}
function r(e) {
	let t = /* @__PURE__ */ new Set();
	for (let r of e) {
		let e = n(r);
		e && t.add(e);
	}
	return t;
}
function i(t, i) {
	let a = r(t);
	for (let e of i ?? []) {
		let t = n(e);
		t && a.delete(t);
	}
	for (let t of e) a.delete(t);
	return a;
}
function a(e, t) {
	let r = /* @__PURE__ */ new Set();
	for (let i of e) {
		let e = n(i);
		e && t.has(e) && r.add(e);
	}
	return r;
}
function o(e, t) {
	return a((e.telemetry?.dependencies?.nodes ?? []).filter((e) => e.origin === "project").map((e) => e.id), t);
}
function s(e) {
	return !e.success || !e.pdf || e.errors.some((e) => e.severity === "error") ? !1 : !e.telemetry?.diagnostics.some((e) => e.severity === "error");
}
function c(e, t, n) {
	if (!s(e)) return "compile-failed";
	if (t) return t;
	if (n.some((e) => !e.complete)) return "auxiliary-stage-failed";
}
function l(e, t, n, r) {
	let i = a(t.inputFiles ?? [], n), c = t.inputFilesComplete === !0 && s(t) && i.has(r);
	return e === "xelatex" ? {
		projectInputs: /* @__PURE__ */ new Set([...i, ...o(t, n)]),
		coverage: [
			{
				stage: "latex",
				source: "recorder",
				complete: c
			},
			{
				stage: "pdf-conversion",
				source: "log",
				complete: !1
			},
			{
				stage: "pdf-conversion",
				source: "xdv",
				complete: !1
			}
		],
		incompleteReason: c ? "pdf-conversion-recorder-unavailable" : "engine-recorder-unavailable"
	} : {
		projectInputs: i,
		coverage: [{
			stage: "latex",
			source: "recorder",
			complete: c
		}],
		...c ? {} : { incompleteReason: "recorder-unavailable" }
	};
}
function u(e) {
	let t = e.auxiliaryStages ?? [], r = i(e.projectFiles, e.generatedFiles), o = n(e.root) ?? e.root, s = l(e.engine, e.result, r, o);
	for (let e of t) {
		for (let t of a(e.projectInputs, r)) s.projectInputs.add(t);
		s.coverage.push({
			stage: e.stage,
			source: "backend-request",
			complete: e.complete
		});
	}
	let u = c(e.result, s.incompleteReason, t);
	return {
		version: 1,
		root: o,
		projectInputs: [...s.projectInputs].sort(),
		complete: u === void 0,
		coverage: s.coverage,
		...u ? { incompleteReason: u } : {}
	};
}
function d(e, t) {
	let r = n(e) ?? e, i = new Set(t?.projectInputs ?? []);
	return i.add(r), {
		version: 1,
		root: r,
		projectInputs: [...i].sort(),
		complete: !1,
		coverage: [{
			stage: "latex",
			source: "recorder",
			complete: !1
		}],
		incompleteReason: "incremental-dependencies-unavailable"
	};
}
//#endregion
export { u as buildDependencyManifest, d as buildIncrementalDependencyManifest, n as normalizeProjectDependencyPath };
