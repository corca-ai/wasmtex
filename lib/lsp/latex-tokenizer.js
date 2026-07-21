const d = /* @__PURE__ */ new Set([
  "verbatim",
  "verbatim*",
  "Verbatim",
  "BVerbatim",
  "lstlisting",
  "minted",
  "alltt",
  "comment"
]), p = /* @__PURE__ */ new Set(["verb", "verb*", "lstinline", "mintinline"]), a = (r) => r >= "a" && r <= "z" || r >= "A" && r <= "Z", u = (r) => r >= "0" && r <= "9";
class m {
  constructor(s) {
    this.src = s;
  }
  pos = 0;
  line = 1;
  col = 1;
  tokens = [];
  tokenize() {
    for (; this.pos < this.src.length; ) {
      const s = this.src[this.pos];
      s === "\\" ? this.readControlSequence() : s === "{" ? this.emitSingle("open", s) : s === "}" ? this.emitSingle("close", s) : s === "%" ? this.readComment() : s === "$" ? this.readMath() : s === "#" ? this.readParam() : this.readText();
    }
    return this.tokens;
  }
  /** Advance one character, tracking line/column. */
  advance() {
    const s = this.src[this.pos];
    return this.pos++, s === `
` ? (this.line++, this.col = 1) : this.col++, s;
  }
  /**
   * Consume `src[pos, end)` in one shot: update line/column over the whole span,
   * advance `pos` to `end`, and return the slice. Scanning to `end` and slicing
   * once avoids the per-character `value += advance()` concatenation that
   * dominated tokenize time on large documents.
   */
  consumeTo(s) {
    const h = this.src, n = this.pos;
    let e = -1;
    for (let t = n; t < s; t++)
      h.charCodeAt(t) === 10 && (this.line++, e = t);
    return this.col = e >= 0 ? s - e : this.col + (s - n), this.pos = s, h.slice(n, s);
  }
  push(s, h, n, e, t) {
    this.tokens.push({ type: s, value: h, start: n, end: this.pos, line: e, column: t });
  }
  emitSingle(s, h) {
    const n = this.pos, e = this.line, t = this.col;
    this.advance(), this.push(s, h, n, e, t);
  }
  readControlSequence() {
    const s = this.pos, h = this.line, n = this.col;
    if (this.advance(), this.pos >= this.src.length) {
      this.push("command", "", s, h, n);
      return;
    }
    const e = this.src[this.pos];
    let t;
    if (a(e)) {
      const i = this.src, o = i.length;
      let c = this.pos;
      for (; c < o && a(i[c]); ) c++;
      t = this.consumeTo(c);
    } else
      t = this.advance();
    this.push("command", t, s, h, n), p.has(t) && this.readInlineVerb(t);
  }
  /**
   * After `\verb`/`\lstinline`/`\mintinline` (etc.): read the verbatim argument.
   *
   * `\verb`/`\verb*` use the next char as a one-shot delimiter. The listings/minted
   * inline forms additionally accept an optional `[options]` group and brace-delimited
   * bodies: `\lstinline[opts]{code}`, `\mintinline[opts]{lang}{code}`. Without
   * brace/bracket awareness the `[` or first `{` would be mistaken for the delimiter,
   * swallowing the real `{code}`/trailing source as verbatim.
   */
  readInlineVerb(s) {
    this.pos >= this.src.length || (this.src[this.pos] === "*" && this.advance(), !(this.pos >= this.src.length) && ((s === "lstinline" || s === "mintinline") && this.readBracketedVerb(s) || this.readDelimitedVerb()));
  }
  /**
   * Handle the listings/minted brace forms: an optional `[options]` group, `\mintinline`'s
   * mandatory `{language}` group, then a brace-delimited `{code}` body emitted as one verb
   * token. Returns true when it emitted the verb; false to fall through to the generic
   * single-char delimiter (e.g. `\lstinline|code|`).
   */
  readBracketedVerb(s) {
    return this.src[this.pos] === "[" && this.skipBalancedGroup("[", "]"), this.pos >= this.src.length || (s === "mintinline" && this.src[this.pos] === "{" && this.skipBalancedGroup("{", "}"), this.pos >= this.src.length || this.src[this.pos] !== "{") ? !1 : (this.readBraceVerb(), !0);
  }
  /** Generic `\verb`-style reader: the next char is the delimiter; read raw until it repeats. */
  readDelimitedVerb() {
    const s = this.advance(), h = this.pos, n = this.line, e = this.col, t = this.src, i = t.length;
    let o = this.pos;
    for (; o < i && t[o] !== s && t[o] !== `
`; ) o++;
    const c = this.consumeTo(o);
    this.pos < i && t[this.pos] === s && this.advance(), this.push("verb", c, h, n, e);
  }
  /**
   * Consume a balanced `open..close` group starting at the current `open` char,
   * tracking nesting depth. Stops at a newline if the group never closes (inline
   * verb args are single-line), so malformed input can't run away.
   */
  skipBalancedGroup(s, h) {
    const n = this.src, e = n.length;
    let t = 0, i = this.pos;
    for (; i < e; ) {
      const o = n[i];
      if (o === `
`) break;
      if (o === s) t++;
      else if (o === h && --t === 0) {
        i++;
        break;
      }
      i++;
    }
    this.consumeTo(i);
  }
  /** Read a balanced `{..}` group as a single verb token (contents between the braces). */
  readBraceVerb() {
    this.advance();
    const s = this.pos, h = this.line, n = this.col, e = this.src, t = e.length;
    let i = 1, o = this.pos;
    for (; o < t; ) {
      const l = e[o];
      if (l === `
`) break;
      if (l === "{") i++;
      else if (l === "}" && --i === 0) break;
      o++;
    }
    const c = this.consumeTo(o);
    this.pos < t && e[this.pos] === "}" && this.advance(), this.push("verb", c, s, h, n);
  }
  readComment() {
    const s = this.pos, h = this.line, n = this.col, e = this.src, t = e.length;
    let i = this.pos;
    for (; i < t && e[i] !== `
`; ) i++;
    const o = this.consumeTo(i);
    this.push("comment", o, s, h, n);
  }
  readMath() {
    const s = this.pos, h = this.line, n = this.col;
    this.advance(), this.pos < this.src.length && this.src[this.pos] === "$" ? (this.advance(), this.push("math", "$$", s, h, n)) : this.push("math", "$", s, h, n);
  }
  readParam() {
    const s = this.pos, h = this.line, n = this.col;
    this.advance();
    let e = "";
    this.pos < this.src.length && u(this.src[this.pos]) && (e = this.advance()), this.push("param", e, s, h, n);
  }
  readText() {
    const s = this.pos, h = this.line, n = this.col, e = this.src, t = e.length;
    let i = s, o = 0, c = -1;
    for (; i < t; ) {
      const l = e.charCodeAt(i);
      if (l === 92 || l === 123 || l === 125 || l === 37 || l === 36 || l === 35) break;
      l === 10 && (o++, c = i), i++;
    }
    o > 0 ? (this.line += o, this.col = i - c) : this.col += i - s, this.pos = i, this.push("text", e.slice(s, i), s, h, n);
  }
}
function f(r) {
  return new m(r).tokenize();
}
export {
  d as VERBATIM_ENVIRONMENTS,
  f as tokenize
};
