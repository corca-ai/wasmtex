import { PRELOAD_FILES as e } from "./texlive-manifest.js";
//#region src/engine/transport-prefetch.ts
var t = 128, n = 8388608, r = 1048576, i = 8, a = /^(?:cm(?:r|mi|sy)(?:5|7|10)|cmex10|cmbx(?:10|12)|cmti10|msbm10)\.pfb$/, o = e.filter((e) => e.format === 32 ? a.test(e.filename) : e.format !== 26 || !/^(?:article\.cls|ams.*\.sty)$/.test(e.filename));
function s(e) {
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
async function c(a, c, l, u = /* @__PURE__ */ new Set()) {
	let d = [], f = /* @__PURE__ */ new Set(), p = (e) => {
		for (let n of e) {
			let e = `${n.format}/${n.filename}`;
			f.size >= t || f.has(e) || u.has(e) || (f.add(e), d.push(n));
		}
	}, m = !1;
	for (let e of a) p(s(e)), m ||= /\$|\\(?:\[|\(|begin\s*\{(?:equation|align|gather)|(?:usepackage|RequirePackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*ams)/.test(e);
	u.size === 0 && p(m ? o : e.filter((e) => [
		"l3backend-pdftex.def",
		"size10.clo",
		"cmr10.pfb"
	].includes(e.filename)));
	let h = [], g = 0, _ = () => !l.aborted && g < n;
	async function v(e) {
		let t = await fetch(`${c}pdftex/${e.format}/${e.filename}`, { signal: l });
		if (t.status !== 200) return;
		let i = await t.arrayBuffer();
		!_() || i.byteLength > r || g + i.byteLength > n || (g += i.byteLength, h.push({
			...e,
			data: i,
			fileId: t.headers.get("fileid")
		}), e.format === 26 && p(s(new TextDecoder().decode(i))));
	}
	async function y() {
		for (; d.length && _();) {
			let e = d.shift();
			try {
				await v(e);
			} catch {}
		}
	}
	return await Promise.all(Array.from({ length: i }, () => y())), h;
}
//#endregion
export { s as declaredTexFiles, c as prefetchTexliveResponses };
