import { isAssetResponse as e } from "./asset-response.js";
import { PRELOAD_FILES as t } from "./texlive-manifest.js";
//#region src/engine/transport-prefetch.ts
var n = 128, r = 8388608, i = 1048576, a = 8, o = /^(?:cm(?:r|mi|sy)(?:5|7|10)|cmex10|cmbx(?:10|12)|cmti10|msbm10)\.pfb$/, s = t.filter((e) => e.format === 32 ? o.test(e.filename) : e.format !== 26 || !/^(?:article\.cls|ams.*\.sty)$/.test(e.filename));
function c(e) {
	let t = e.replace(/(^|[^\\])(?:\\\\)*%[^\n]*/g, "$1"), n = [];
	for (let e of t.matchAll(/\\(documentclass|LoadClass(?:WithOptions)?|usepackage|RequirePackage(?:WithOptions)?)\s*(?:\[[^\]]*\]\s*)?\{([^{}]*)\}/g)) {
		let t = /class/i.test(e[1]) ? ".cls" : ".sty";
		for (let r of e[2].split(",").map((e) => e.trim())) /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(r) && n.push({
			format: 26,
			filename: r + t
		});
	}
	for (let e of t.matchAll(/\\(?:input|InputIfFileExists|@input)\s*\{?([A-Za-z0-9][A-Za-z0-9_.-]*\.(?:sty|cls|def|clo|fd|cfg))(?=[\s}])/g)) n.push({
		format: 26,
		filename: e[1]
	});
	return n;
}
async function l(o, l, u, d = /* @__PURE__ */ new Set()) {
	let f = [], p = /* @__PURE__ */ new Set(), m = (e) => {
		for (let t of e) {
			let e = `${t.format}/${t.filename}`;
			p.size >= n || p.has(e) || d.has(e) || (p.add(e), f.push(t));
		}
	}, h = !1;
	for (let e of o) m(c(e)), h ||= /\$|\\(?:\[|\(|begin\s*\{(?:equation|align|gather)|(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*ams)/.test(e);
	d.size === 0 && m(h ? s : t.filter((e) => [
		"l3backend-pdftex.def",
		"size10.clo",
		"cmr10.pfb"
	].includes(e.filename)));
	let g = [], _ = 0, v = () => !u.aborted && _ < r;
	async function y(t) {
		let n = await fetch(`${l}pdftex/${t.format}/${t.filename}`, { signal: u });
		if (!e(n)) {
			await n.body?.cancel();
			return;
		}
		let a = await n.arrayBuffer();
		!v() || a.byteLength > i || _ + a.byteLength > r || (_ += a.byteLength, g.push({
			...t,
			data: a,
			fileId: n.headers.get("fileid")
		}), t.format === 26 && m(c(new TextDecoder().decode(a))));
	}
	async function b() {
		for (; f.length && v();) {
			let e = f.shift();
			try {
				await y(e);
			} catch {}
		}
	}
	return await Promise.all(Array.from({ length: a }, () => b())), g;
}
//#endregion
export { c as declaredTexFiles, l as prefetchTexliveResponses };
