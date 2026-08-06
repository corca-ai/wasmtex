//#region src/lsp/latex-tokenizer.ts
var e = /* @__PURE__ */ new Set([
	"verbatim",
	"verbatim*",
	"Verbatim",
	"BVerbatim",
	"lstlisting",
	"minted",
	"alltt",
	"comment"
]), t = /* @__PURE__ */ new Set([
	"verb",
	"verb*",
	"lstinline",
	"mintinline"
]), n = (e) => e >= "a" && e <= "z" || e >= "A" && e <= "Z", r = (e) => e >= "0" && e <= "9", i = class {
	src;
	pos = 0;
	line = 1;
	col = 1;
	tokens = [];
	constructor(e) {
		this.src = e;
	}
	tokenize() {
		for (; this.pos < this.src.length;) {
			let e = this.src[this.pos];
			e === "\\" ? this.readControlSequence() : e === "{" ? this.emitSingle("open", e) : e === "}" ? this.emitSingle("close", e) : e === "%" ? this.readComment() : e === "$" ? this.readMath() : e === "#" ? this.readParam() : this.readText();
		}
		return this.tokens;
	}
	advance() {
		let e = this.src[this.pos];
		return this.pos++, e === "\n" ? (this.line++, this.col = 1) : this.col++, e;
	}
	consumeTo(e) {
		let t = this.src, n = this.pos, r = -1;
		for (let i = n; i < e; i++) t.charCodeAt(i) === 10 && (this.line++, r = i);
		return this.col = r >= 0 ? e - r : this.col + (e - n), this.pos = e, t.slice(n, e);
	}
	push(e, t, n, r, i) {
		this.tokens.push({
			type: e,
			value: t,
			start: n,
			end: this.pos,
			line: r,
			column: i
		});
	}
	emitSingle(e, t) {
		let n = this.pos, r = this.line, i = this.col;
		this.advance(), this.push(e, t, n, r, i);
	}
	readControlSequence() {
		let e = this.pos, r = this.line, i = this.col;
		if (this.advance(), this.pos >= this.src.length) {
			this.push("command", "", e, r, i);
			return;
		}
		let a = this.src[this.pos], o;
		if (n(a)) {
			let e = this.src, t = e.length, r = this.pos;
			for (; r < t && n(e[r]);) r++;
			o = this.consumeTo(r);
		} else o = this.advance();
		this.push("command", o, e, r, i), t.has(o) && this.readInlineVerb(o);
	}
	readInlineVerb(e) {
		this.pos >= this.src.length || (this.src[this.pos] === "*" && this.advance(), !(this.pos >= this.src.length) && ((e === "lstinline" || e === "mintinline") && this.readBracketedVerb(e) || this.readDelimitedVerb()));
	}
	readBracketedVerb(e) {
		return this.src[this.pos] === "[" && this.skipBalancedGroup("[", "]"), this.pos >= this.src.length || (e === "mintinline" && this.src[this.pos] === "{" && this.skipBalancedGroup("{", "}"), this.pos >= this.src.length || this.src[this.pos] !== "{") ? !1 : (this.readBraceVerb(), !0);
	}
	readDelimitedVerb() {
		let e = this.advance(), t = this.pos, n = this.line, r = this.col, i = this.src, a = i.length, o = this.pos;
		for (; o < a && i[o] !== e && i[o] !== "\n";) o++;
		let s = this.consumeTo(o);
		this.pos < a && i[this.pos] === e && this.advance(), this.push("verb", s, t, n, r);
	}
	skipBalancedGroup(e, t) {
		let n = this.src, r = n.length, i = 0, a = this.pos;
		for (; a < r;) {
			let r = n[a];
			if (r === "\n") break;
			if (r === e) i++;
			else if (r === t && --i === 0) {
				a++;
				break;
			}
			a++;
		}
		this.consumeTo(a);
	}
	readBraceVerb() {
		this.advance();
		let e = this.pos, t = this.line, n = this.col, r = this.src, i = r.length, a = 1, o = this.pos;
		for (; o < i;) {
			let e = r[o];
			if (e === "\n") break;
			if (e === "{") a++;
			else if (e === "}" && --a === 0) break;
			o++;
		}
		let s = this.consumeTo(o);
		this.pos < i && r[this.pos] === "}" && this.advance(), this.push("verb", s, e, t, n);
	}
	readComment() {
		let e = this.pos, t = this.line, n = this.col, r = this.src, i = r.length, a = this.pos;
		for (; a < i && r[a] !== "\n";) a++;
		let o = this.consumeTo(a);
		this.push("comment", o, e, t, n);
	}
	readMath() {
		let e = this.pos, t = this.line, n = this.col;
		this.advance(), this.pos < this.src.length && this.src[this.pos] === "$" ? (this.advance(), this.push("math", "$$", e, t, n)) : this.push("math", "$", e, t, n);
	}
	readParam() {
		let e = this.pos, t = this.line, n = this.col;
		this.advance();
		let i = "";
		this.pos < this.src.length && r(this.src[this.pos]) && (i = this.advance()), this.push("param", i, e, t, n);
	}
	readText() {
		let e = this.pos, t = this.line, n = this.col, r = this.src, i = r.length, a = e, o = 0, s = -1;
		for (; a < i;) {
			let e = r.charCodeAt(a);
			if (e === 92 || e === 123 || e === 125 || e === 37 || e === 36 || e === 35) break;
			e === 10 && (o++, s = a), a++;
		}
		o > 0 ? (this.line += o, this.col = a - s) : this.col += a - e, this.pos = a, this.push("text", r.slice(e, a), e, t, n);
	}
};
function a(e) {
	return new i(e).tokenize();
}
//#endregion
export { e as VERBATIM_ENVIRONMENTS, a as tokenize };
