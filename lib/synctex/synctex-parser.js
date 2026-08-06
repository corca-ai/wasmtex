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
var a = {
	"[": "vbox",
	"(": "hbox",
	v: "void_vbox",
	h: "void_hbox",
	x: "kern",
	k: "kern",
	g: "glue",
	$: "math"
};
function o(e, t) {
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
function s(e, t, n) {
	let r, i, a, o;
	if (n.type === "hbox" || n.type === "vbox") r = n.h, i = r + n.width, a = n.v - n.height, o = n.v + n.depth;
	else if (n.type === "void_hbox" || n.type === "void_vbox") {
		let r = c(e, t, n.h, n.h, n.v - n.height, n.v + n.depth), i = c(e, t, n.h + n.width, n.h + n.width, n.v - n.height, n.v + n.depth);
		return Math.min(r, i);
	} else if (n.type === "kern") {
		let r = n.parent ? n.parent.height : 0, i = c(e, t, n.h, n.h, n.v - r, n.v), a = c(e, t, n.h - n.width, n.h - n.width, n.v - r, n.v);
		return Math.min(i, a);
	} else {
		let s = n.parent ? n.parent.height : 0;
		return r = n.h, i = n.h, o = n.v, a = o - s, c(e, t, r, i, a, o);
	}
	return c(e, t, r, i, a, o);
}
function c(e, t, n, r, i, a) {
	let o = 0, s = 0;
	return e < n ? o = n - e : e > r && (o = e - r), t < i ? s = i - t : t > a && (s = t - a), o + s;
}
function l(e) {
	let t = e;
	return t.startsWith("/work/./") ? t = t.slice(8) : t.startsWith("/work/") ? t = t.slice(6) : t.startsWith("./") && (t = t.slice(2)), t.replace(/\/\.\//g, "/");
}
var u = class {
	async parse(e) {
		let n = await t(e), r = new TextDecoder().decode(n);
		return this.parseText(r);
	}
	parseText(t) {
		let i = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map(), s = {
			inputs: /* @__PURE__ */ new Map(),
			pages: /* @__PURE__ */ new Map(),
			pageRoots: i,
			friendIndex: o,
			magnification: 1e3,
			unit: 1,
			xOffset: 0,
			yOffset: 0
		}, c = (e) => {
			let t = e.indexOf(":"), n = e.indexOf(":", t + 1);
			if (n !== -1) {
				let r = parseInt(e.slice(t + 1, n), 10);
				s.inputs.set(r, l(e.slice(n + 1)));
			}
		}, u = t.split(/\r?\n/), d = 0, f = !1, p = [];
		for (let t of u) {
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
					Number.isFinite(e) && e > 0 && (s.magnification = e);
				} else if (t.startsWith("Unit:")) {
					let e = parseInt(t.slice(5), 10);
					Number.isFinite(e) && e > 0 && (s.unit = e);
				} else if (t.startsWith("X Offset:")) {
					let e = parseInt(t.slice(9), 10);
					Number.isFinite(e) && (s.xOffset = e);
				} else if (t.startsWith("Y Offset:")) {
					let e = parseInt(t.slice(9), 10);
					Number.isFinite(e) && (s.yOffset = e);
				}
				continue;
			}
			if (t.startsWith("Postamble:")) break;
			let l = t[0];
			if (l === "{") {
				d = parseInt(t.slice(1), 10), s.pages.has(d) || (s.pages.set(d, []), i.set(d, [])), p.length = 0;
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
			let u = a[l];
			if (!u || d === 0) continue;
			let [m, h, g, _] = n(t.slice(1));
			if (!_ && h === 0) continue;
			let [v, y, b, x, S] = r(_), C = s.unit, w = s.magnification, T = {
				type: u,
				input: m,
				line: h,
				column: g,
				page: d,
				h: e(v + s.xOffset, C, w),
				v: e(y + s.yOffset, C, w),
				width: e(b, C, w),
				height: e(Math.abs(x), C, w),
				depth: e(Math.abs(S), C, w),
				parent: null,
				children: []
			};
			if (p.length > 0) {
				let e = p[p.length - 1];
				T.parent = e, e.children.push(T);
			} else i.get(d).push(T);
			if ((l === "[" || l === "(") && p.push(T), s.pages.get(d).push(T), h > 0) {
				let e = `${m}:${h}`, t = o.get(e);
				t || (t = [], o.set(e, t)), t.push(T);
			}
		}
		return s;
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
				let i = s(n, r, t);
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
				let o = s(n, r, a);
				o < i && (i = o, t = a);
			}
			if (t) return {
				file: e.inputs.get(t.input) ?? "",
				line: t.line
			};
		}
		let c = null, l = Infinity;
		for (let e of i) {
			if (e.line === 0) continue;
			let t = s(n, r, e);
			t < l && (l = t, c = e);
		}
		return c ? {
			file: e.inputs.get(c.input) ?? "",
			line: c.line
		} : null;
	}
	forwardLookup(e, t, n) {
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
		if (r === -1) return null;
		let i = n, a = 1;
		for (let t = 0; t < 100 && !(Math.abs(i - n) > 3); t++) {
			if (i > 0) {
				let t = this.forwardForLine(e, r, i);
				if (t) return t;
			}
			i += a, a = a < 0 ? -(a - 1) : -(a + 1), i <= 0 && (i += a, a = a < 0 ? -(a - 1) : -(a + 1));
		}
		return null;
	}
	forwardForLine(e, t, n) {
		let r = e.friendIndex?.get(`${t}:${n}`);
		if (!r || r.length === 0) return null;
		let a = r.filter((e) => e.width > 0 || !i(e));
		if (a.length === 0) return null;
		let o = a.reduce((e, t) => t.page < e ? t.page : e, Infinity), s = a.filter((e) => e.page === o), c = s.filter((e) => !i(e));
		if (c.length > 0) {
			let e = this.forwardFromNodes(c);
			if (e) return e;
		}
		return this.forwardFromNodes(s);
	}
	forwardFromNodes(e) {
		let t = e[0].page, n = e.filter((e) => e.page === t);
		if (n.length === 0) return null;
		let r = /* @__PURE__ */ new Set(), i = [];
		for (let e of n) if (e.type === "hbox" || e.type === "void_hbox") i.push(e);
		else if (e.type !== "vbox" && e.type !== "void_vbox") {
			let t = this.findAncestorHbox(e);
			t && r.add(t);
		}
		return r.size > 0 ? this.bboxFromNodes([...r], t) : i.length > 0 ? this.bboxFromNodes(i, t) : this.bboxFromNodes(n, t);
	}
	pointInBox(e, t, n) {
		return o(e, n) === 0 && this.vOrderedDistance(t, n) === 0;
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
				let n = s(e, t, a);
				n < i && (i = n, r = a);
			}
			if (r) return this.deepestContainer(e, t, r);
		}
		return n;
	}
	getClosestChildrenInBox(e, t, n) {
		let r = null, i = Infinity, a = null, s = Infinity;
		for (let c of n.children) {
			let n = o(e, c);
			if (n > 0) (n < s || n === s && a && c.line < a.line) && (a = c, s = n);
			else if (n === 0) {
				if (c.children.length > 0) return this.getClosestChildrenInBox(e, t, c);
				r = c, i = 0;
			} else {
				let e = -n;
				(e < i || e === i && r && c.line < r.line) && (r = c, i = e);
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
		return e && t ? e.line <= 0 && t.line > 0 ? t : t.line <= 0 && e.line > 0 ? e : e.input !== t.input || e.line !== t.line ? t.line < e.line ? t : e.line < t.line || s(n, r, e) <= s(n, r, t) ? e : t : s(n, r, e) <= s(n, r, t) ? e : t : e ?? t;
	}
	closestDeepChild(e, t, n) {
		if (n.children.length === 0) return null;
		let r = null, i = Infinity;
		for (let a of n.children) {
			let n, o;
			if (a.children.length > 0) {
				let r = this.closestDeepChild(e, t, a);
				r ? (n = r, o = s(e, t, r)) : (n = a, o = s(e, t, a));
			} else n = a, o = s(e, t, a);
			(o < i || o === i && n.type !== "kern" && r?.type === "kern") && (r = n, i = o);
		}
		return r;
	}
	findAncestorHbox(e) {
		let t = e.parent;
		for (; t;) {
			if (t.type === "hbox") return t;
			t = t.parent;
		}
		return null;
	}
	bboxFromNodes(e, t) {
		let n = Infinity, r = -Infinity, i = Infinity, a = -Infinity;
		for (let t of e) {
			let e = t.v - t.height, o = t.v + t.depth;
			t.h < n && (n = t.h), t.h + t.width > r && (r = t.h + t.width), e < i && (i = e), o > a && (a = o);
		}
		return a - i < 2 && (i = e[0].v - 12, a = e[0].v + 3), {
			page: t,
			x: n,
			y: i,
			width: Math.max(r - n, 10),
			height: Math.max(a - i, 10)
		};
	}
};
//#endregion
export { u as SynctexParser, l as normalizeSynctexInputName };
