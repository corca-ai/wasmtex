import { describeSynctexInverseMatch as e, synctexSourceLocation as t } from "./synctex-query-result.js";
//#region src/synctex/synctex-parser.ts
var n = 72 / 72.27;
function r(e, t, r) {
	return e * t * r / 65536e3 * n;
}
async function i(e) {
	if (e.length >= 2 && e[0] === 31 && e[1] === 139) {
		if (typeof DecompressionStream > "u") throw Error("DecompressionStream not available — cannot decompress synctex.gz");
		let t = new DecompressionStream("gzip"), n = t.writable.getWriter(), r = t.readable.getReader();
		n.write(e).then(() => n.close()).catch(() => {});
		let i = [];
		for (;;) {
			let { done: e, value: t } = await r.read();
			if (e) break;
			i.push(t);
		}
		let a = i.reduce((e, t) => e + t.length, 0), o = new Uint8Array(a), s = 0;
		for (let e of i) o.set(e, s), s += e.length;
		return o;
	}
	return e;
}
function a(e) {
	let t = e.indexOf(":");
	if (t === -1) return [
		0,
		0,
		0,
		""
	];
	let n = e.slice(0, t), r = e.slice(t + 1), i = n.split(",");
	return [
		parseInt(i[0] ?? "0", 10),
		parseInt(i[1] ?? "0", 10),
		i.length > 2 ? parseInt(i[2] ?? "0", 10) : 0,
		r
	];
}
function o(e) {
	let t = e.indexOf(":"), n, r;
	t === -1 ? (n = e, r = null) : (n = e.slice(0, t), r = e.slice(t + 1));
	let i = n.split(","), a = parseInt(i[0] ?? "0", 10), o = parseInt(i[1] ?? "0", 10);
	if (!r) return [
		a,
		o,
		0,
		0,
		0
	];
	let s = r.split(",");
	return [
		a,
		o,
		parseInt(s[0] ?? "0", 10),
		parseInt(s[1] ?? "0", 10),
		parseInt(s[2] ?? "0", 10)
	];
}
function s(e) {
	return e.type === "hbox" || e.type === "vbox" || e.type === "void_hbox" || e.type === "void_vbox";
}
var c = 40;
function l(e, t) {
	return Math.min(e.y + e.height, t.y + t.height) - Math.max(e.y, t.y) >= .5 * Math.min(e.height, t.height);
}
function u(e, t) {
	return Math.max(e.x, t.x) - Math.min(e.x + e.width, t.x + t.width) <= 3;
}
var d = {
	"[": "vbox",
	"(": "hbox",
	v: "void_vbox",
	h: "void_hbox",
	x: "kern",
	k: "kern",
	g: "glue",
	$: "math"
};
function f(e, t) {
	if (t.type === "hbox" || t.type === "vbox" || t.type === "void_hbox" || t.type === "void_vbox") {
		let n = t.h, r = n + t.width;
		return e < n ? n - e : e > r ? r - e : 0;
	}
	if (t.type === "kern") {
		let n = t.width, r, i;
		n > 0 ? (r = t.h - n, i = t.h) : (r = t.h, i = t.h - n);
		let a = (r + i) / 2;
		return e < r ? r - e + .01 : e > i ? i - e - .01 : e > a ? i - e + .01 : r - e - .01;
	}
	return t.h - e;
}
function p(e, t, n) {
	let r, i, a, o;
	if (n.type === "hbox" || n.type === "vbox") r = n.h, i = r + n.width, a = n.v - n.height, o = n.v + n.depth;
	else if (n.type === "void_hbox" || n.type === "void_vbox") {
		let r = m(e, t, n.h, n.h, n.v - n.height, n.v + n.depth), i = m(e, t, n.h + n.width, n.h + n.width, n.v - n.height, n.v + n.depth);
		return Math.min(r, i);
	} else if (n.type === "kern") {
		let r = n.parent ? n.parent.height : 0, i = m(e, t, n.h, n.h, n.v - r, n.v), a = m(e, t, n.h - n.width, n.h - n.width, n.v - r, n.v);
		return Math.min(i, a);
	} else {
		let s = n.parent ? n.parent.height : 0;
		return r = n.h, i = n.h, o = n.v, a = o - s, m(e, t, r, i, a, o);
	}
	return m(e, t, r, i, a, o);
}
function m(e, t, n, r, i, a) {
	let o = 0, s = 0;
	return e < n ? o = n - e : e > r && (o = e - r), t < i ? s = i - t : t > a && (s = t - a), o + s;
}
function h(e) {
	let t = e;
	return t.startsWith("/work/./") ? t = t.slice(8) : t.startsWith("/work/") ? t = t.slice(6) : t.startsWith("./") && (t = t.slice(2)), t.replace(/\/\.\//g, "/");
}
async function g() {
	{
		let e = Reflect.get(globalThis, "scheduler");
		if (typeof e == "object" && e && "yield" in e && typeof e.yield == "function") {
			await e.yield();
			return;
		}
	}
	await new Promise((e) => {
		let t = new MessageChannel();
		t.port1.onmessage = () => {
			t.port1.close(), t.port2.close(), e();
		}, t.port2.postMessage(null);
	});
}
var _ = class {
	async parse(e, t = {}) {
		t.signal?.throwIfAborted();
		let n = await i(e);
		t.signal?.throwIfAborted();
		let r = new TextDecoder().decode(n);
		if (r.length < 262144) return this.parseText(r);
		let a = this.parseChunks(r), o = performance.now() + 4;
		for (;;) {
			t.signal?.throwIfAborted();
			let e = a.next();
			if (e.done) return e.value;
			performance.now() >= o && (await g(), o = performance.now() + 4);
		}
	}
	parseText(e) {
		let t = this.parseChunks(e);
		for (;;) {
			let e = t.next();
			if (e.done) return e.value;
		}
	}
	*parseChunks(e) {
		let t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), i = {
			inputs: /* @__PURE__ */ new Map(),
			pages: /* @__PURE__ */ new Map(),
			pageRoots: t,
			friendIndex: n,
			magnification: 1e3,
			unit: 1,
			xOffset: 0,
			yOffset: 0
		}, s = (e) => {
			let t = e.indexOf(":"), n = e.indexOf(":", t + 1);
			if (n !== -1) {
				let r = parseInt(e.slice(t + 1, n), 10);
				i.inputs.set(r, h(e.slice(n + 1)));
			}
		}, c = 0, l = 0, u = 0, f = !1, p = [];
		for (; c < e.length;) {
			let m = e.indexOf("\n", c), h = m < 0 ? e.length : m, g = e.slice(c, m >= 0 && e.charCodeAt(h - 1) === 13 ? h - 1 : h);
			if (c = h + 1, ++l % 256 == 0 && (yield), !g) continue;
			if (g.startsWith("Input:")) {
				s(g);
				continue;
			}
			if (!f) {
				if (g === "Content:") {
					f = !0;
					continue;
				}
				if (g.startsWith("Magnification:")) {
					let e = parseInt(g.slice(14), 10);
					Number.isFinite(e) && e > 0 && (i.magnification = e);
				} else if (g.startsWith("Unit:")) {
					let e = parseInt(g.slice(5), 10);
					Number.isFinite(e) && e > 0 && (i.unit = e);
				} else if (g.startsWith("X Offset:")) {
					let e = parseInt(g.slice(9), 10);
					Number.isFinite(e) && (i.xOffset = e);
				} else if (g.startsWith("Y Offset:")) {
					let e = parseInt(g.slice(9), 10);
					Number.isFinite(e) && (i.yOffset = e);
				}
				continue;
			}
			if (g.startsWith("Postamble:")) break;
			let _ = g[0];
			if (_ === "{") {
				u = parseInt(g.slice(1), 10), i.pages.has(u) || (i.pages.set(u, []), t.set(u, [])), p.length = 0;
				continue;
			}
			if (_ === "}") {
				p.length = 0;
				continue;
			}
			if (_ === "]" || _ === ")") {
				p.length > 0 && p.pop();
				continue;
			}
			if (_ === "!") continue;
			let v = d[_];
			if (!v || u === 0) continue;
			let [y, b, x, S] = a(g.slice(1));
			if (!S && b === 0) continue;
			let [C, w, T, E, D] = o(S), O = i.unit, k = i.magnification, A = {
				type: v,
				input: y,
				line: b,
				column: x,
				page: u,
				h: r(C + i.xOffset, O, k),
				v: r(w + i.yOffset, O, k),
				width: r(T, O, k),
				height: r(Math.abs(E), O, k),
				depth: r(Math.abs(D), O, k),
				parent: null,
				children: []
			};
			if (p.length > 0) {
				let e = p[p.length - 1];
				A.parent = e, e.children.push(A);
			} else t.get(u).push(A);
			if ((_ === "[" || _ === "(") && p.push(A), i.pages.get(u).push(A), b > 0) {
				let e = `${y}:${b}`, t = n.get(e);
				t || (t = [], n.set(e, t)), t.push(A);
			}
		}
		return i;
	}
	inverseLookup(e, t, n, r) {
		let i = this.inverseLookupDetailed(e, t, n, r);
		return i ? {
			file: i.source.file,
			line: i.source.line
		} : null;
	}
	inverseLookupDetailed(n, r, i, a, o) {
		let s = n.pages.get(r);
		if (!s || s.length === 0) return null;
		let c = (e) => o?.acceptSource?.(t(n, e)) ?? !0, l = null;
		for (let e of s) e.type === "hbox" && this.pointInBox(i, a, e) && (l = l ? this.smallestContainer(e, l) : e);
		if (!l) {
			let e = Infinity;
			for (let t of s) {
				if (t.type !== "hbox") continue;
				let n = p(i, a, t);
				n < e && (e = n, l = t);
			}
		}
		if (l) {
			l = this.deepestContainer(i, a, l);
			let { l: t, r } = this.getClosestChildrenInBox(i, a, l), s = this.pickBestLR(t, r, i, a), u = o?.acceptSource ? /* @__PURE__ */ new Set([
				s,
				t,
				r
			]) : [s];
			for (let t of u) if (t && t.line > 0 && c(t)) return e(n, t, i, a, "bracket", l);
			if (l.line > 0 && c(l)) return e(n, l, i, a, "container", l);
		}
		let u = n.pageRoots?.get(r);
		if (u && u.length > 0) {
			let t = null, r = Infinity;
			for (let e of u) {
				let n = this.closestDeepChild(i, a, e);
				if (!n || n.line === 0 || !c(n)) continue;
				let o = p(i, a, n);
				o < r && (r = o, t = n);
			}
			if (t) return e(n, t, i, a, "nearest-child");
		}
		let d = null, f = Infinity;
		for (let e of s) {
			if (e.line === 0 || !c(e)) continue;
			let t = p(i, a, e);
			t < f && (f = t, d = e);
		}
		return d ? e(n, d, i, a, "nearest-node") : null;
	}
	forwardLookup(e, t, n) {
		return this.forwardLookupAll(e, t, n)[0] ?? null;
	}
	forwardLookupAll(e, t, n) {
		return this.forwardLookupDetailed(e, t, n)?.regions ?? [];
	}
	forwardLookupDetailed(e, t, n, r) {
		let i = -1;
		for (let [n, r] of e.inputs) if (r === t) {
			i = n;
			break;
		}
		if (i === -1) {
			for (let [n, r] of e.inputs) if (r.endsWith(`/${t}`)) {
				i = n;
				break;
			}
		}
		if (i === -1) return null;
		let a = e.inputs.get(i) ?? t, o = n, s = 1;
		for (let t = 0; t < 100 && !(Math.abs(o - n) > 3); t++) {
			if (o > 0) {
				let t = {
					file: a,
					line: o
				};
				if (r?.acceptSource?.(t) ?? !0) {
					let r = this.forwardForLine(e, i, o);
					if (r.length > 0) return {
						source: t,
						requestedLine: n,
						match: o === n ? "exact" : "nearby",
						regions: r
					};
				}
			}
			o += s, s = s < 0 ? -(s - 1) : -(s + 1), o <= 0 && (o += s, s = s < 0 ? -(s - 1) : -(s + 1));
		}
		return null;
	}
	forwardForLine(e, t, n) {
		let r = e.friendIndex?.get(`${t}:${n}`);
		if (!r || r.length === 0) return [];
		let i = r.filter((e) => e.width > 0 || !s(e));
		if (i.length === 0) return [];
		let a = i.reduce((e, t) => t.page < e ? t.page : e, Infinity), o = i.filter((e) => e.page === a), c = o.filter((e) => !s(e));
		if (c.length > 0) {
			let e = this.forwardFromNodes(c);
			if (e.length > 0) return e;
		}
		return this.forwardFromNodes(o);
	}
	forwardFromNodes(e) {
		let t = e[0].page, n = e.filter((e) => e.page === t);
		if (n.length === 0) return [];
		let r = /* @__PURE__ */ new Set();
		for (let e of n) {
			let t = this.lineBoxFor(e);
			t && r.add(t);
		}
		if (r.size > 0) return this.locationsFromLineBoxes([...r], t);
		let i = n.filter((e) => !s(e) && !(e.parent && this.isPageScale(e.parent)));
		return i.length > 0 ? [this.bboxFromNodes(i, t)] : [];
	}
	lineBoxFor(e) {
		let t = e.type === "hbox" ? e : e.parent, n = null;
		for (; t;) {
			if (t.type === "hbox") {
				if (this.isPageScale(t)) break;
				n = t;
			} else if ((t.type === "vbox" || t.type === "void_vbox") && t.height + t.depth > c) break;
			t = t.parent;
		}
		return n;
	}
	locationsFromLineBoxes(e, t) {
		let n = new Set(e), r = /* @__PURE__ */ new Set();
		for (let t of e) {
			let e = t.parent;
			for (; e;) n.has(e) && r.add(e), e = e.parent;
		}
		let i = e.filter((e) => !r.has(e) && !this.isPageScale(e)), a = [];
		for (let e of i) {
			let n = this.bboxFromNodes([e], t), r = a.find((e) => l(e, n) && u(e, n));
			if (!r) {
				a.push(n);
				continue;
			}
			let i = Math.max(r.x + r.width, n.x + n.width), o = Math.max(r.y + r.height, n.y + n.height);
			r.x = Math.min(r.x, n.x), r.y = Math.min(r.y, n.y), r.width = i - r.x, r.height = o - r.y;
		}
		return a;
	}
	isPageScale(e) {
		let t = e.parent;
		for (; t?.parent;) t = t.parent;
		if (!t) return e.type === "vbox" && e.height + e.depth > 0;
		let n = t.height + t.depth;
		return n > 0 && e.height + e.depth > n / 2;
	}
	pointInBox(e, t, n) {
		return f(e, n) === 0 && this.vOrderedDistance(t, n) === 0;
	}
	vOrderedDistance(e, t) {
		let n, r;
		if (t.type === "hbox") n = t.v - t.height, r = t.v + t.depth;
		else if (t.type === "vbox" || t.type === "void_vbox" || t.type === "void_hbox") n = t.v - t.height, r = t.v + t.depth;
		else {
			let i = t.parent;
			if (i) n = t.v - i.height, r = t.v + i.depth;
			else return t.v - e;
		}
		return e < n ? n - e : e > r ? r - e : 0;
	}
	smallestContainer(e, t) {
		let n = e.width * (e.height + e.depth), r = t.width * (t.height + t.depth);
		return n < r ? e : n > r ? t : e.height + e.depth < t.height + t.depth ? e : t;
	}
	deepestContainer(e, t, n) {
		if (n.children.length === 0) return n;
		for (let r of n.children) if (this.pointInBox(e, t, r)) return this.deepestContainer(e, t, r);
		if (n.type === "vbox") {
			let r = null, i = Infinity;
			for (let a of n.children) if (a.children.length > 0) {
				let n = p(e, t, a);
				n < i && (i = n, r = a);
			}
			if (r) return this.deepestContainer(e, t, r);
		}
		return n;
	}
	getClosestChildrenInBox(e, t, n) {
		let r = null, i = Infinity, a = null, o = Infinity;
		for (let s of n.children) {
			let n = f(e, s);
			if (n > 0) (n < o || n === o && a && s.line < a.line) && (a = s, o = n);
			else if (n === 0) {
				if (s.children.length > 0) return this.getClosestChildrenInBox(e, t, s);
				r = s, i = 0;
			} else {
				let e = -n;
				(e < i || e === i && r && s.line < r.line) && (r = s, i = e);
			}
		}
		if (r && r.children.length > 0) {
			let n = this.closestDeepChild(e, t, r);
			n && (r = n);
		}
		if (a && a.children.length > 0) {
			let n = this.closestDeepChild(e, t, a);
			n && (a = n);
		}
		return {
			l: r,
			r: a
		};
	}
	pickBestLR(e, t, n, r) {
		return e && t ? e.line <= 0 && t.line > 0 ? t : t.line <= 0 && e.line > 0 ? e : e.input !== t.input || e.line !== t.line ? t.line < e.line ? t : e.line < t.line || p(n, r, e) <= p(n, r, t) ? e : t : p(n, r, e) <= p(n, r, t) ? e : t : e ?? t;
	}
	closestDeepChild(e, t, n) {
		if (n.children.length === 0) return null;
		let r = null, i = Infinity;
		for (let a of n.children) {
			let n, o;
			if (a.children.length > 0) {
				let r = this.closestDeepChild(e, t, a);
				r ? (n = r, o = p(e, t, r)) : (n = a, o = p(e, t, a));
			} else n = a, o = p(e, t, a);
			(o < i || o === i && n.type !== "kern" && r?.type === "kern") && (r = n, i = o);
		}
		return r;
	}
	bboxFromNodes(e, t) {
		let n = Infinity, r = -Infinity, i = Infinity, a = -Infinity;
		for (let t of e) {
			let e = t.v - t.height, o = t.v + t.depth;
			t.h < n && (n = t.h), t.h + t.width > r && (r = t.h + t.width), e < i && (i = e), o > a && (a = o);
		}
		return a - i < 2 ? (i = e[0].v - 12, a = e[0].v + 3, {
			page: t,
			x: n,
			y: i,
			width: Math.max(r - n, 10),
			height: a - i
		}) : {
			page: t,
			x: n,
			y: i,
			width: Math.max(r - n, 1),
			height: Math.max(a - i, 1)
		};
	}
};
//#endregion
export { _ as SynctexParser, h as normalizeSynctexInputName };
