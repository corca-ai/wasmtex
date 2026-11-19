import { normalizeProjectDependencyPath as e } from "./dependency-manifest.js";
//#region src/engine/eps-graphics.ts
function t(t, n) {
	let r = n === "xelatex" ? t.matchAll(/^xdvipdfmx:warning: No image converter available for converting file "([^"\r\n]+)" to PDF format\./gm) : t.matchAll(/^! Package (?:pdftex|luatex)\.def Error: File `([^']{1,2048})'\s+not\s+found:/gm), i = /* @__PURE__ */ new Map();
	for (let t of r) {
		let r = e(t[1].replaceAll(/\r?\n/g, ""));
		if (!r) continue;
		if (n === "xelatex") {
			/\.eps$/i.test(r) && i.set(r, r);
			continue;
		}
		let a = /-(eps)-converted-to\.pdf$/i.exec(r);
		a && i.set(`${r.slice(0, a.index)}.${a[1]}`, r);
	}
	return Array.from(i, ([e, t]) => ({
		path: e,
		output: t
	}));
}
function n(t) {
	let n = /^PSfile="([^"]{1,4096}\.eps)"(?:\s|$)/i.exec(t)?.[1];
	if (!n) return null;
	let r = /[^\u0020-\u007e]/.test(n) ? new TextDecoder().decode(Uint8Array.from(n, (e) => e.charCodeAt(0))) : n;
	return e(r);
}
function r(e) {
	return e.replace(/\.(eps)$/i, "-$1-converted-to.pdf");
}
var i = new TextEncoder().encode("%PDF-"), a = 16777216, o = 33554432;
function s(e) {
	return !(e instanceof Uint8Array) || e.length <= i.length || e.length > 33554432 || !i.every((t, n) => e[n] === t) ? !1 : /%%EOF[\s\0]*$/.test(new TextDecoder().decode(e.subarray(-1024)));
}
var c = "eps-conversion-failed";
function l(e, t, n) {
	let r = `EPS conversion failed for ${t}: ${n.slice(0, 500)}`;
	return {
		...e,
		success: !1,
		pdf: null,
		synctex: null,
		synctexData: null,
		log: `${e.log}\n${r}`,
		errors: [...e.errors, {
			code: c,
			line: 0,
			message: r,
			file: t,
			severity: "error"
		}]
	};
}
//#endregion
export { c as EPS_CONVERSION_FAILED, o as MAX_CONVERTED_EPS_BYTES, a as MAX_EPS_BYTES, l as epsConversionFailure, r as epsSidecar, t as requestedEpsGraphics, s as validConvertedEps, n as xetexEpsSpecial };
