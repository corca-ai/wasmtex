import { normalizeVisibleText as e } from "./visible-text-normalize.js";
//#region src/synctex/visible-pdf-text.ts
function t(t, n = !1) {
	let r = [], i = [], a = 0, o = !1;
	for (let e of t.matchAll(/[-\u2010][ \t]*\r?\n[ \t]*(?=\p{L})/gu)) {
		let n = e.index;
		if (n === 0 || !/\p{L}/u.test(t[n - 1])) continue;
		let s = {
			text: t.slice(a, n),
			start: a,
			end: n
		};
		r.push(s, {
			text: t[n],
			start: n,
			end: n + 1
		}), i.push(s), a = n + e[0].length, o = !0;
	}
	let s = {
		text: t.slice(a),
		start: a,
		end: t.length
	};
	r.push(s), i.push(s);
	let c = [{
		method: "exact",
		normalized: e(r)
	}];
	return n && o && c.push({
		method: "dehyphenated",
		normalized: e(i)
	}), c;
}
//#endregion
export { t as projectVisiblePdfText };
