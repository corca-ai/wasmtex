import { parseGlyphOccurrences as e } from "./parse-errors.js";
//#region src/engine/xdv.ts
var t = 128, n = 132, r = 133, i = 137, a = 138, o = 139, s = 140, c = 141, l = 142, u = 143, d = 147, f = 148, p = 152, m = 153, h = 157, g = 161, _ = 162, v = 166, y = 167, b = 171, x = 235, S = 239, C = 243, w = 247, T = 248, E = 252, D = 253, O = 254, k = .8, A = class {
	dv;
	pos = 0;
	constructor(e) {
		this.dv = new DataView(e.buffer, e.byteOffset, e.byteLength);
	}
	get eof() {
		return this.pos >= this.dv.byteLength;
	}
	u8() {
		return this.dv.getUint8(this.pos++);
	}
	u16() {
		let e = this.dv.getUint16(this.pos);
		return this.pos += 2, e;
	}
	u32() {
		let e = this.dv.getUint32(this.pos);
		return this.pos += 4, e;
	}
	s32() {
		let e = this.dv.getInt32(this.pos);
		return this.pos += 4, e;
	}
	uint(e) {
		let t = 0;
		for (let n = 0; n < e; n++) t = t * 256 + this.u8();
		return t;
	}
	sint(e) {
		let t = this.u8();
		t >= 128 && (t -= 256);
		for (let n = 1; n < e; n++) t = t * 256 + this.u8();
		return t;
	}
	ascii(e) {
		let t = "";
		for (let n = 0; n < e; n++) t += String.fromCharCode(this.u8());
		return t;
	}
	utf16(e) {
		let t = "";
		for (let n = 0; n < e; n++) t += String.fromCharCode(this.u16());
		return t;
	}
	skip(e) {
		this.pos += e;
	}
}, j = 72;
function M(e, t) {
	return e >= t && e <= t + 3;
}
function N(e, t, n, r) {
	if (!e.cur) return;
	let i = {
		x: j + e.st.h * e.dvi2pts,
		y: j + e.st.v * e.dvi2pts,
		width: t * e.dvi2pts,
		size: (e.fontSize.get(e.curFont) ?? 0) * e.dvi2pts,
		glyphs: n
	};
	r && (i.text = r);
	let a = e.fontName.get(e.curFont);
	a && (i.font = a), e.cur.textRuns.push(i);
}
function P(e, t) {
	let { r: n } = e, r = t ? n.utf16(n.u16()) : void 0, i = n.s32(), a = n.u16(), o = Array(a), s = Array(a);
	for (let e = 0; e < a; e++) o[e] = n.s32(), s[e] = n.s32();
	let c = (e.fontSize.get(e.curFont) ?? 0) * e.dvi2pts;
	for (let t = 0; t < a; t++) n.u16() === 0 && e.placements.push({
		page: e.page,
		x: j + (e.st.h + o[t]) * e.dvi2pts,
		y: j + (e.st.v + s[t]) * e.dvi2pts,
		size: c
	});
	N(e, i, a, r), e.st.h += i;
}
function F(e) {
	let { r: t } = e, n = t.s32(), r = t.u32(), i = t.u16();
	e.fontName.set(n, t.ascii(t.u8()).replace(/^.*\//, "")), t.skip(4), i & 512 && t.skip(4), i & 4096 && t.skip(4), i & 8192 && t.skip(4), i & 16384 && t.skip(4), e.fontSize.set(n, r);
}
function I(e, t, n) {
	!e.cur || t <= 0 || n <= 0 || e.cur.rules.push({
		x: j + e.st.h * e.dvi2pts,
		y: j + (e.st.v - t) * e.dvi2pts,
		width: n * e.dvi2pts,
		height: t * e.dvi2pts
	});
}
function L(e, t) {
	let { r: n, st: r } = t;
	return M(e, u) ? (r.h += n.sint(e - u + 1), !0) : M(e, h) ? (r.v += n.sint(e - h + 1), !0) : M(e, f) ? (r.w = n.sint(e - f + 1), r.h += r.w, !0) : M(e, m) ? (r.x = n.sint(e - m + 1), r.h += r.x, !0) : M(e, _) ? (r.y = n.sint(e - _ + 1), r.v += r.y, !0) : M(e, y) ? (r.z = n.sint(e - y + 1), r.v += r.z, !0) : R(e, t);
}
function R(e, t) {
	let { r, st: a } = t;
	if (e === d) return a.h += a.w, !0;
	if (e === p) return a.h += a.x, !0;
	if (e === g) return a.v += a.y, !0;
	if (e === v) return a.v += a.z, !0;
	if (e === n) {
		let e = r.s32(), n = r.s32();
		return I(t, e, n), a.h += n, !0;
	}
	return e === i && (I(t, r.s32(), r.s32()), !0);
}
function z(e, n) {
	let { r: i } = n;
	return e <= 127 ? (n.reliable = !1, !0) : e >= b && e <= 234 ? (n.curFont = e - b, !0) : M(e, t) ? (i.skip(e - t + 1), n.reliable = !1, !0) : M(e, r) ? (i.skip(e - r + 1), !0) : M(e, x) ? (n.curFont = i.uint(e - x + 1), !0) : M(e, C) ? (V(n, e), !0) : M(e, S) ? (W(n, i.ascii(i.uint(e - S + 1))), !0) : B(e, n);
}
function B(e, t) {
	return e === E ? (F(t), !0) : e === D ? (P(t, !1), !0) : e === O && (P(t, !0), !0);
}
function V(e, t) {
	let { r: n } = e;
	n.skip(t - C + 1), n.skip(12);
	let r = n.u8(), i = n.u8();
	n.skip(r + i);
}
var H = {
	bp: 1,
	pt: 72 / 72.27,
	in: 72,
	mm: 72 / 25.4,
	cm: 72 / 2.54
}, U = /([\d.]+)\s*(bp|pt|in|mm|cm)\b/gi;
function W(e, t) {
	if (!/p(?:aper|age)size/i.test(t)) return;
	let n = [...t.matchAll(U)];
	if (n.length < 2) return;
	let r = Number(n[0][1]) * (H[n[0][2].toLowerCase()] ?? 1), i = Number(n[1][1]) * (H[n[1][2].toLowerCase()] ?? 1);
	r > 0 && i > 0 && (e.paper = {
		width: r,
		height: i
	}, e.cur && (e.cur.width = r, e.cur.height = i));
}
function G(e) {
	let t = {
		page: e.page,
		textRuns: [],
		rules: []
	};
	e.paper && (t.width = e.paper.width, t.height = e.paper.height), e.pages.push(t), e.cur = t;
}
function K(e, t) {
	let { r: n } = t;
	switch (e) {
		case a:
		case s: return "ok";
		case c: return t.stack.push({ ...t.st }), "ok";
		case l: {
			let e = t.stack.pop();
			return e && (t.st = e), "ok";
		}
		case o: return t.page = n.s32(), n.skip(40), t.st = {
			h: 0,
			v: 0,
			w: 0,
			x: 0,
			y: 0,
			z: 0
		}, t.stack.length = 0, G(t), "ok";
		case w: {
			n.u8();
			let e = n.u32(), r = n.u32();
			return n.u32(), n.skip(n.u8()), t.dvi2pts = e / r * (72 / 254e3), "ok";
		}
		case T: return "stop";
		default: return "no";
	}
}
function q(e, t) {
	if (!e) return t;
	let n = Math.min(e.x, t.x), r = Math.min(e.y, t.y);
	return {
		x: n,
		y: r,
		width: Math.max(e.x + e.width, t.x + t.width) - n,
		height: Math.max(e.y + e.height, t.y + t.height) - r
	};
}
function J(e) {
	for (let t of e) {
		let e;
		for (let n of t.textRuns) e = q(e, {
			x: n.x,
			y: n.y - n.size * k,
			width: n.width,
			height: n.size * 1
		});
		for (let n of t.rules) e = q(e, n);
		e && (t.contentBox = e);
	}
}
function Y(e) {
	let t = {
		r: new A(e),
		placements: [],
		pages: [],
		cur: null,
		paper: null,
		fontSize: /* @__PURE__ */ new Map(),
		fontName: /* @__PURE__ */ new Map(),
		dvi2pts: 0,
		reliable: !0,
		page: 0,
		curFont: -1,
		st: {
			h: 0,
			v: 0,
			w: 0,
			x: 0,
			y: 0,
			z: 0
		},
		stack: []
	};
	try {
		for (; !t.r.eof;) {
			let e = t.r.u8();
			if (L(e, t) || z(e, t)) continue;
			let n = K(e, t);
			if (n === "stop") break;
			if (n === "no") {
				t.reliable = !1;
				break;
			}
		}
	} catch {
		t.reliable = !1;
	}
	return J(t.pages), {
		pages: t.pages,
		placements: t.placements,
		reliable: t.reliable
	};
}
function X(t, n, r, i) {
	if (!r || n.length === 0) return;
	let a = e(i);
	if (a.length !== n.length) return;
	let o = new Map(t.map((e) => [e.font, e])), s = /* @__PURE__ */ new Map();
	for (let e = 0; e < a.length; e++) {
		let { font: t, codepoint: r } = a[e], i = n[e], o = s.get(t) ?? [];
		o.push({
			codepoint: r,
			output: {
				page: i.page,
				x: i.x,
				y: i.y - i.size * k,
				width: i.size,
				height: i.size
			}
		}), s.set(t, o);
	}
	for (let [e, t] of s) {
		let n = o.get(e);
		n && (n.occurrences = t);
	}
}
//#endregion
export { X as attachPlacements, Y as parseXdv };
