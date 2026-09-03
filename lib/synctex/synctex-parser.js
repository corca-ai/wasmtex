function e(e, t, n) {
	return e * t * n / 65536e3 * .9962640099626402;
}
async function t(e) {
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
function n(e) {
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
function r(e) {
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
function i(e) {
	return e.type === "hbox" || e.type === "vbox" || e.type === "void_hbox" || e.type === "void_vbox";
}
function a(e, t) {
	return Math.min(e.y + e.height, t.y + t.height) - Math.max(e.y, t.y) >= .5 * Math.min(e.height, t.height);
}
function o(e, t) {
	return Math.max(e.x, t.x) - Math.min(e.x + e.width, t.x + t.width) <= 3;
}
var s = {
	"[": "vbox",
	"(": "hbox",
	v: "void_vbox",
	h: "void_hbox",
	x: "kern",
	k: "kern",
	g: "glue",
	$: "math"
};
function c(e, t) {
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
function l(e, t, n) {
	let r, i, a, o;
	if (n.type === "hbox" || n.type === "vbox") r = n.h, i = r + n.width, a = n.v - n.height, o = n.v + n.depth;
	else if (n.type === "void_hbox" || n.type === "void_vbox") {
		let r = u(e, t, n.h, n.h, n.v - n.height, n.v + n.depth), i = u(e, t, n.h + n.width, n.h + n.width, n.v - n.height, n.v + n.depth);
		return Math.min(r, i);
	} else if (n.type === "kern") {
		let r = n.parent ? n.parent.height : 0, i = u(e, t, n.h, n.h, n.v - r, n.v), a = u(e, t, n.h - n.width, n.h - n.width, n.v - r, n.v);
		return Math.min(i, a);
	} else {
		let s = n.parent ? n.parent.height : 0;
		return r = n.h, i = n.h, o = n.v, a = o - s, u(e, t, r, i, a, o);
	}
	return u(e, t, r, i, a, o);
}
function u(e, t, n, r, i, a) {
	let o = 0, s = 0;
	return e < n ? o = n - e : e > r && (o = e - r), t < i ? s = i - t : t > a && (s = t - a), o + s;
}
function d(e) {
	let t = e;
	return t.startsWith("/work/./") ? t = t.slice(8) : t.startsWith("/work/") ? t = t.slice(6) : t.startsWith("./") && (t = t.slice(2)), t.replace(/\/\.\//g, "/");
}
var f = class {
	async parse(e) {
		let n = await t(e), r = new TextDecoder().decode(n);
		return this.parseText(r);
	}
	parseText(t) {
		let i = /* @__PURE__ */ new Map(), a = /* @__PURE__ */ new Map(), o = {
			inputs: /* @__PURE__ */ new Map(),
			pages: /* @__PURE__ */ new Map(),
			pageRoots: i,
			friendIndex: a,
			magnification: 1e3,
			unit: 1,
			xOffset: 0,
			yOffset: 0
		}, c = (e) => {
			let t = e.indexOf(":"), n = e.indexOf(":", t + 1);
			if (n !== -1) {
				let r = parseInt(e.slice(t + 1, n), 10);
				o.inputs.set(r, d(e.slice(n + 1)));
			}
		}, l = t.split(/\r?\n/), u = 0, f = !1, p = [];
		for (let t of l) {
			if (!t) continue;
			if (t.startsWith("Input:")) {
				c(t);
				continue;
			}
			if (!f) {
				if (t === "Content:") {
					f = !0;
					continue;
				}
				if (t.startsWith("Magnification:")) {
					let e = parseInt(t.slice(14), 10);
					Number.isFinite(e) && e > 0 && (o.magnification = e);
				} else if (t.startsWith("Unit:")) {
					let e = parseInt(t.slice(5), 10);
					Number.isFinite(e) && e > 0 && (o.unit = e);
				} else if (t.startsWith("X Offset:")) {
					let e = parseInt(t.slice(9), 10);
					Number.isFinite(e) && (o.xOffset = e);
				} else if (t.startsWith("Y Offset:")) {
					let e = parseInt(t.slice(9), 10);
					Number.isFinite(e) && (o.yOffset = e);
				}
				continue;
			}
			if (t.startsWith("Postamble:")) break;
			let l = t[0];
			if (l === "{") {
				u = parseInt(t.slice(1), 10), o.pages.has(u) || (o.pages.set(u, []), i.set(u, [])), p.length = 0;
				continue;
			}
			if (l === "}") {
				p.length = 0;
				continue;
			}
			if (l === "]" || l === ")") {
				p.length > 0 && p.pop();
				continue;
			}
			if (l === "!") continue;
			let d = s[l];
			if (!d || u === 0) continue;
			let [m, h, g, _] = n(t.slice(1));
			if (!_ && h === 0) continue;
			let [v, y, b, x, S] = r(_), C = o.unit, w = o.magnification, T = {
				type: d,
				input: m,
				line: h,
				column: g,
				page: u,
				h: e(v + o.xOffset, C, w),
				v: e(y + o.yOffset, C, w),
				width: e(b, C, w),
				height: e(Math.abs(x), C, w),
				depth: e(Math.abs(S), C, w),
				parent: null,
				children: []
			};
			if (p.length > 0) {
				let e = p[p.length - 1];
				T.parent = e, e.children.push(T);
			} else i.get(u).push(T);
			if ((l === "[" || l === "(") && p.push(T), o.pages.get(u).push(T), h > 0) {
				let e = `${m}:${h}`, t = a.get(e);
				t || (t = [], a.set(e, t)), t.push(T);
			}
		}
		return o;
	}
	inverseLookup(e, t, n, r) {
		let i = e.pages.get(t);
		if (!i || i.length === 0) return null;
		let a = null;
		for (let e of i) e.type === "hbox" && this.pointInBox(n, r, e) && (a = a ? this.smallestContainer(e, a) : e);
		if (!a) {
			let e = Infinity;
			for (let t of i) {
				if (t.type !== "hbox") continue;
				let i = l(n, r, t);
				i < e && (e = i, a = t);
			}
		}
		if (a) {
			a = this.deepestContainer(n, r, a);
			let { l: t, r: i } = this.getClosestChildrenInBox(n, r, a), o = this.pickBestLR(t, i, n, r);
			if (o && o.line > 0) return {
				file: e.inputs.get(o.input) ?? "",
				line: o.line
			};
			if (a.line > 0) return {
				file: e.inputs.get(a.input) ?? "",
				line: a.line
			};
		}
		let o = e.pageRoots?.get(t);
		if (o && o.length > 0) {
			let t = null, i = Infinity;
			for (let e of o) {
				let a = this.closestDeepChild(n, r, e);
				if (!a || a.line === 0) continue;
				let o = l(n, r, a);
				o < i && (i = o, t = a);
			}
			if (t) return {
				file: e.inputs.get(t.input) ?? "",
				line: t.line
			};
		}
		let s = null, c = Infinity;
		for (let e of i) {
			if (e.line === 0) continue;
			let t = l(n, r, e);
			t < c && (c = t, s = e);
		}
		return s ? {
			file: e.inputs.get(s.input) ?? "",
			line: s.line
		} : null;
	}
	forwardLookup(e, t, n) {
		return this.forwardLookupAll(e, t, n)[0] ?? null;
	}
	forwardLookupAll(e, t, n) {
		let r = -1;
		for (let [n, i] of e.inputs) if (i === t) {
			r = n;
			break;
		}
		if (r === -1) {
			for (let [n, i] of e.inputs) if (i.endsWith(`/${t}`)) {
				r = n;
				break;
			}
		}
		if (r === -1) return [];
		let i = n, a = 1;
		for (let t = 0; t < 100 && !(Math.abs(i - n) > 3); t++) {
			if (i > 0) {
				let t = this.forwardForLine(e, r, i);
				if (t.length > 0) return t;
			}
			i += a, a = a < 0 ? -(a - 1) : -(a + 1), i <= 0 && (i += a, a = a < 0 ? -(a - 1) : -(a + 1));
		}
		return [];
	}
	forwardForLine(e, t, n) {
		let r = e.friendIndex?.get(`${t}:${n}`);
		if (!r || r.length === 0) return [];
		let a = r.filter((e) => e.width > 0 || !i(e));
		if (a.length === 0) return [];
		let o = a.reduce((e, t) => t.page < e ? t.page : e, Infinity), s = a.filter((e) => e.page === o), c = s.filter((e) => !i(e));
		if (c.length > 0) {
			let e = this.forwardFromNodes(c);
			if (e.length > 0) return e;
		}
		return this.forwardFromNodes(s);
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
		let a = n.filter((e) => !i(e) && !(e.parent && this.isPageScale(e.parent)));
		return a.length > 0 ? [this.bboxFromNodes(a, t)] : [];
	}
	lineBoxFor(e) {
		let t = e.type === "hbox" ? e : e.parent, n = null;
		for (; t;) {
			if (t.type === "hbox") {
				if (this.isPageScale(t)) break;
				n = t;
			} else if ((t.type === "vbox" || t.type === "void_vbox") && t.height + t.depth > 40) break;
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
		let i = e.filter((e) => !r.has(e) && !this.isPageScale(e)), s = [];
		for (let e of i) {
			let n = this.bboxFromNodes([e], t), r = s.find((e) => a(e, n) && o(e, n));
			if (!r) {
				s.push(n);
				continue;
			}
			let i = Math.max(r.x + r.width, n.x + n.width), c = Math.max(r.y + r.height, n.y + n.height);
			r.x = Math.min(r.x, n.x), r.y = Math.min(r.y, n.y), r.width = i - r.x, r.height = c - r.y;
		}
		return s;
	}
	isPageScale(e) {
		let t = e.parent;
		for (; t?.parent;) t = t.parent;
		if (!t) return e.type === "vbox" && e.height + e.depth > 0;
		let n = t.height + t.depth;
		return n > 0 && e.height + e.depth > n / 2;
	}
	pointInBox(e, t, n) {
		return c(e, n) === 0 && this.vOrderedDistance(t, n) === 0;
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
				let n = l(e, t, a);
				n < i && (i = n, r = a);
			}
			if (r) return this.deepestContainer(e, t, r);
		}
		return n;
	}
	getClosestChildrenInBox(e, t, n) {
		let r = null, i = Infinity, a = null, o = Infinity;
		for (let s of n.children) {
			let n = c(e, s);
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
		return e && t ? e.line <= 0 && t.line > 0 ? t : t.line <= 0 && e.line > 0 ? e : e.input !== t.input || e.line !== t.line ? t.line < e.line ? t : e.line < t.line || l(n, r, e) <= l(n, r, t) ? e : t : l(n, r, e) <= l(n, r, t) ? e : t : e ?? t;
	}
	closestDeepChild(e, t, n) {
		if (n.children.length === 0) return null;
		let r = null, i = Infinity;
		for (let a of n.children) {
			let n, o;
			if (a.children.length > 0) {
				let r = this.closestDeepChild(e, t, a);
				r ? (n = r, o = l(e, t, r)) : (n = a, o = l(e, t, a));
			} else n = a, o = l(e, t, a);
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
export { f as SynctexParser, d as normalizeSynctexInputName };
