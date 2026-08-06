//#region src/lsp/color-completion.ts
var e = [
	[
		"black",
		"gray",
		"0"
	],
	[
		"blue",
		"rgb",
		"0,0,1"
	],
	[
		"brown",
		"rgb",
		".75,.5,.25"
	],
	[
		"cyan",
		"rgb",
		"0,1,1"
	],
	[
		"darkgray",
		"gray",
		".25"
	],
	[
		"gray",
		"gray",
		".5"
	],
	[
		"green",
		"rgb",
		"0,1,0"
	],
	[
		"lightgray",
		"gray",
		".75"
	],
	[
		"lime",
		"rgb",
		".75,1,0"
	],
	[
		"magenta",
		"rgb",
		"1,0,1"
	],
	[
		"olive",
		"rgb",
		".5,.5,0"
	],
	[
		"orange",
		"rgb",
		"1,.5,0"
	],
	[
		"pink",
		"rgb",
		"1,.75,.75"
	],
	[
		"purple",
		"rgb",
		".75,0,.25"
	],
	[
		"red",
		"rgb",
		"1,0,0"
	],
	[
		"teal",
		"rgb",
		"0,.5,.5"
	],
	[
		"violet",
		"rgb",
		".5,0,.5"
	],
	[
		"white",
		"gray",
		"1"
	],
	[
		"yellow",
		"rgb",
		"1,1,0"
	]
], t = /* @__PURE__ */ new Set([
	"black",
	"blue",
	"cyan",
	"green",
	"magenta",
	"red",
	"white",
	"yellow"
]);
function n(n) {
	return e.filter(([e]) => n || t.has(e)).map(([e, t, r]) => ({
		name: e,
		kind: "define",
		model: t,
		value: r,
		source: n ? "WasmTex xcolor baseline" : "WasmTex color baseline",
		confidence: "exact",
		priority: -1
	}));
}
function r(e, t) {
	let n = t.provenance.map((e) => `${e.sourcePath}${e.line ? `:${e.line}` : ""}`).join(", ");
	return {
		name: t.name,
		kind: t.kind,
		...t.model ? { model: t.model } : {},
		...t.value ? { value: t.value } : {},
		...t.alias ? { alias: t.alias } : {},
		source: n || e.scope.id,
		confidence: t.confidence,
		priority: t.priority ?? 0
	};
}
function i(e) {
	let t = e.provenance === "runtime-observed";
	return {
		name: e.name,
		kind: e.kind,
		...e.model ? { model: e.model } : {},
		...e.value ? { value: e.value } : {},
		...e.alias ? { alias: e.alias } : {},
		source: `${e.location.file}:${e.location.line}`,
		confidence: t ? "runtime-observed" : "project",
		priority: t ? 50 : 100
	};
}
function a(e, t) {
	t.kind === "provide" && e.has(t.name) || e.set(t.name, t);
}
function o(e, t, n) {
	let r = e.availability?.anyOptions, i = e.availability?.deferredOptions;
	if ((!r || r.length === 0) && (!i || i.length === 0)) return !0;
	let a = /* @__PURE__ */ new Set([...n.index.getClassOptions(n.document.path), ...n.index.getPackageOptions(t.scope.name, n.document.path)]);
	return r?.some((e) => a.has(e)) ? !0 : i?.some((e) => a.has(e)) === !0 && n.index.getActiveColorNames(n.document.path).has(e.name);
}
function s(e, t) {
	let s = e.index.getLoadedPackages(e.document.path), c = /* @__PURE__ */ new Map(), l = s.has("xcolor") || t.some((e) => e.scope.id === "package/xcolor");
	if (l || s.has("color")) for (let e of n(l)) a(c, e);
	let u = t.flatMap((t) => t.colors.filter((n) => o(n, t, e)).map((e) => r(t, e))).sort((e, t) => e.priority - t.priority || e.name.localeCompare(t.name));
	for (let e of u) a(c, e);
	for (let t of e.index.getActiveColors(e.document.path)) a(c, i(t));
	return c;
}
function c(e) {
	return Math.max(0, Math.min(255, Math.round(e)));
}
function l(e) {
	return e.length < 3 || e.slice(0, 3).some((e) => !Number.isFinite(e)) ? null : `#${e.slice(0, 3).map((e) => c(e).toString(16).padStart(2, "0")).join("")}`;
}
function u(e, t) {
	if (!e || !t) return null;
	if (e.toUpperCase() === "HTML" && /^[a-f0-9]{6}$/i.test(t)) return `#${t.toLowerCase()}`;
	let n = t.split(",").map(Number);
	if (e === "rgb") return l(n.map((e) => e * 255));
	if (e === "RGB") return l(n);
	if (e === "gray" && Number.isFinite(n[0])) return l([
		n[0] * 255,
		n[0] * 255,
		n[0] * 255
	]);
	if (e === "cmyk" && n.length >= 4) {
		let [e, t, r, i] = n;
		return l([
			255 * (1 - Math.min(1, e + i)),
			255 * (1 - Math.min(1, t + i)),
			255 * (1 - Math.min(1, r + i))
		]);
	}
	return null;
}
function d(e) {
	return !e || !/^#[a-f0-9]{6}$/i.test(e) ? null : [
		1,
		3,
		5
	].map((t) => Number.parseInt(e.slice(t, t + 2), 16));
}
function f(e, t, n) {
	let r = e.split("!"), i = r[0].startsWith("-"), a = r[0].replace(/^-/, "").trim(), o = t.get(a), s = d(o ? p(o, t, n) : null);
	if (!s) return null;
	i && (s = s.map((e) => 255 - e));
	for (let e = 1; e < r.length; e += 2) {
		let i = Number(r[e]);
		if (!Number.isFinite(i)) return null;
		let a = r[e + 1]?.trim() || "white", o = t.get(a), c = d(o ? p(o, t, n) : null);
		if (!c) return null;
		let l = Math.max(0, Math.min(100, i)) / 100;
		s = s.map((e, t) => e * l + c[t] * (1 - l));
	}
	return l(s);
}
function p(e, t, n = /* @__PURE__ */ new Set()) {
	let r = u(e.model, e.value);
	return r || !e.alias || n.has(e.name) ? r : (n.add(e.name), f(e.alias, t, n));
}
function m(e) {
	let t = e.document.lineAt(e.position.line), n = Math.max(0, e.position.column - 1), r = /[!\s{},=[\]]/, i = Math.min(n, t.length), a = i;
	for (; i > 0 && !r.test(t[i - 1]);) i--;
	for (; a < t.length && !r.test(t[a]);) a++;
	return t[i] === "-" && i++, {
		prefix: t.slice(i, n),
		range: {
			startLine: e.position.line,
			startColumn: i + 1,
			endLine: e.position.line,
			endColumn: a + 1
		}
	};
}
function h(e) {
	return [
		e.alias ? `Alias: \`${e.alias}\`` : [e.model, e.value].filter(Boolean).join(" "),
		`Source: \`${e.source}\``,
		`Confidence: ${e.confidence}`
	].filter(Boolean).join("\n\n");
}
function g(e, t) {
	let n = m(e), r = s(e, t);
	return [...r.values()].filter((e) => e.name.startsWith(n.prefix)).sort((e, t) => e.name.localeCompare(t.name)).map((e) => {
		let t = p(e, r);
		return {
			label: e.name,
			kind: "variable",
			insertText: e.name,
			detail: e.alias ? `Color alias · ${e.source}` : `Color · ${e.source}`,
			documentation: h(e),
			replaceLength: n.prefix.length,
			replacementRange: n.range,
			data: { wasmtex: {
				domain: "color",
				...t ? { color: { css: t } } : {},
				provenance: {
					source: e.source,
					confidence: e.confidence
				}
			} }
		};
	});
}
//#endregion
export { g as completeColors };
