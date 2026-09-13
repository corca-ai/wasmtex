import { parseAuxFile as e } from "./aux-parser.js";
//#region src/lsp/aux-files.ts
var t = 1024, n = 2097152;
function r(e) {
	if (e.startsWith("/") || /[\\{}%:#$~]/.test(e) || [...e].some((e) => e.charCodeAt(0) < 32)) return null;
	let t = [];
	for (let n of e.split("/")) if (!(!n || n === ".")) if (n === "..") {
		if (!t.length) return null;
		t.pop();
	} else t.push(n);
	let n = t.join("/");
	return n.endsWith(".aux") ? n : null;
}
async function i(i, a) {
	let o = Object.create(null), s = [i], c = /* @__PURE__ */ new Set(), l = 0;
	for (; s.length && c.size < t;) {
		let i = r(s.shift());
		if (!i || c.has(i)) continue;
		c.add(i);
		let u = await a(i);
		if (u !== null) {
			if (l += u.length, l > n) break;
			o[i] = u, s.push(...e(u).includes.slice(0, t));
		}
	}
	return {
		root: i,
		files: o
	};
}
function a(e, t, n, r) {
	for (let e of t.ambiguousLabels ?? []) r.add(e);
	for (let [i, a] of t.labels) n.has(i) && r.add(i), n.add(i), e.labels.set(i, a);
	for (let [n, r] of t.labelDetails ?? []) e.labelDetails?.set(n, r);
	for (let n of t.citations) e.citations.add(n);
	e.includes.push(...t.includes);
}
function o(e, t) {
	for (let n of t) e.labels.delete(n), e.labelDetails?.delete(n);
	e.ambiguousLabels = t;
}
function s(i) {
	let s = {
		labels: /* @__PURE__ */ new Map(),
		labelDetails: /* @__PURE__ */ new Map(),
		citations: /* @__PURE__ */ new Set(),
		includes: [],
		complete: !0
	}, c = [i.root], l = /* @__PURE__ */ new Set(), u = /* @__PURE__ */ new Set(), d = /* @__PURE__ */ new Set(), f = 0;
	for (; c.length;) {
		let o = r(c.pop());
		if (!o) {
			s.complete = !1;
			continue;
		}
		if (l.has(o)) continue;
		if (l.add(o), l.size > t) {
			s.complete = !1;
			break;
		}
		let p = Object.hasOwn(i.files, o) ? i.files[o] : void 0;
		if (p === void 0) {
			s.complete = !1;
			continue;
		}
		if (f += p.length, f > n) {
			s.complete = !1;
			break;
		}
		let m = e(p);
		if (m.includes.length > t) {
			s.complete = !1;
			break;
		}
		a(s, m, u, d), c.push(...[...m.includes].reverse());
	}
	return o(s, d), s;
}
//#endregion
export { s as parseAuxFiles, i as readAuxFiles };
