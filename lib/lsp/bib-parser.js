import { buildLineStarts as d, offsetToLineCol as m } from "./source-position.js";
function C(s, t) {
  const i = [];
  for (const e of s.listFiles()) {
    if (!e.endsWith(".bib")) continue;
    const r = s.readFile(e);
    typeof r == "string" && i.push(...W(r, e));
  }
  t.updateBib(i);
}
const k = (s) => s >= "a" && s <= "z" || s >= "A" && s <= "Z", g = (s) => s === " " || s === "	" || s === `
` || s === "\r" || s === "\f" || s === "\v" || s > "" && /\s/.test(s), p = (s) => k(s) || s >= "0" && s <= "9" || s === "_" || s === "-" || s === ":" || s === ".";
class y {
  constructor(t) {
    this.src = t;
  }
  pos = 0;
  strings = /* @__PURE__ */ new Map();
  entries = [];
  parse() {
    for (; this.pos < this.src.length && this.skipToAt(); )
      this.readEntryOrCommand();
    return this.entries;
  }
  /** Advance to the next `@`; returns false at end of input. */
  skipToAt() {
    for (; this.pos < this.src.length && this.src[this.pos] !== "@"; ) this.pos++;
    return this.pos < this.src.length;
  }
  skipWs() {
    for (; this.pos < this.src.length && g(this.src[this.pos]); ) this.pos++;
  }
  readName() {
    const t = this.pos;
    for (; this.pos < this.src.length && p(this.src[this.pos]); ) this.pos++;
    return this.src.slice(t, this.pos);
  }
  readEntryOrCommand() {
    this.pos++;
    const t = this.readName().toLowerCase();
    this.skipWs();
    const i = this.src[this.pos];
    if (i !== "{" && i !== "(") return;
    const e = i === "{" ? "}" : ")";
    this.pos++, t === "string" ? this.readString() : t === "preamble" || t === "comment" ? this.skipBalanced() : this.readEntry(t, e);
  }
  readString() {
    this.skipWs();
    const t = this.readName().toLowerCase();
    this.skipWs(), this.src[this.pos] === "=" && (this.pos++, this.strings.set(t, this.readValue())), this.skipBalanced();
  }
  readEntry(t, i) {
    this.skipWs();
    const e = this.pos, r = this.readUntil([",", i]), n = { type: t, key: r.trim(), keyOffset: e, fields: {} };
    this.src[this.pos] === "," && this.pos++, this.readFields(n, i), n.key && this.entries.push(n);
  }
  readFields(t, i) {
    for (; this.pos < this.src.length; ) {
      if (this.skipWs(), this.src[this.pos] === i || this.pos >= this.src.length) {
        this.pos++;
        return;
      }
      const e = this.readName().toLowerCase();
      this.skipWs(), this.src[this.pos] === "=" ? (this.pos++, t.fields[e] = this.readValue()) : e || this.pos++, this.skipWs(), this.src[this.pos] === "," && this.pos++;
    }
  }
  /** Read a field value: `#`-concatenated parts (braces, quotes, or macro/number). */
  readValue() {
    const t = [];
    for (; ; ) {
      this.skipWs();
      const i = this.src[this.pos];
      if (i === "{" || i === '"') t.push(this.readDelimited());
      else if (i !== void 0 && p(i)) t.push(this.readBareValue());
      else break;
      if (this.skipWs(), this.src[this.pos] === "#") this.pos++;
      else break;
    }
    return t.join("");
  }
  /** Read a `{…}`- or `"…"`-delimited value (pos at the opener). A backslash escapes the
   *  next char — so a literal `\{`/`\}` or a `\"` umlaut accent doesn't shift brace depth or
   *  close the value. Inner braces nest in both forms; a quote closes only at brace depth 0. */
  readDelimited() {
    const t = this.src[this.pos] === "{" ? "}" : '"', i = this.pos + 1;
    this.pos++;
    let e = t === "}" ? 1 : 0;
    for (; this.pos < this.src.length; ) {
      const n = this.src[this.pos];
      if (n === "\\") {
        this.pos += 2;
        continue;
      }
      if (n === "{" ? e++ : n === "}" && e > 0 && e--, n === t && (t === '"' || e === 0)) break;
      this.pos++;
    }
    const r = this.src.slice(i, this.pos);
    return this.pos < this.src.length && this.pos++, r;
  }
  /** A bare token: a `@string` macro reference (expanded) or a literal number. */
  readBareValue() {
    const t = this.readName();
    return this.strings.get(t.toLowerCase()) ?? t;
  }
  readUntil(t) {
    const i = this.pos;
    for (; this.pos < this.src.length && !t.includes(this.src[this.pos]); ) this.pos++;
    return this.src.slice(i, this.pos);
  }
  /** Skip to the end of the current entry group (opener already consumed). */
  skipBalanced() {
    let t = 1;
    for (; this.pos < this.src.length && t > 0; ) {
      const i = this.src[this.pos];
      i === "{" || i === "(" ? t++ : (i === "}" || i === ")") && t--, this.pos++;
    }
  }
}
function b(s) {
  const t = new Map(s.map((e) => [e.key.toLowerCase(), e])), i = (e) => e ? t.get(e.toLowerCase()) : void 0;
  for (const e of s)
    l(e, i(e.fields.crossref)), l(e, i(e.fields.xdata));
}
function l(s, t) {
  if (t)
    for (const [i, e] of Object.entries(t.fields))
      i in s.fields || (s.fields[i] = e);
}
function w(s) {
  return s.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}
function W(s, t) {
  const i = new y(s).parse();
  b(i);
  const e = d(s);
  return i.filter((r) => r.type !== "string" && r.type !== "preamble" && r.type !== "comment").map((r) => {
    const { line: n, column: c } = m(e, r.keyOffset), o = {};
    for (const [f, u] of Object.entries(r.fields)) o[f] = w(u);
    const h = {
      key: r.key,
      type: r.type,
      location: { file: t, line: n, column: c },
      fields: o
    };
    o.title && (h.title = o.title), o.author && (h.author = o.author), o.year && (h.year = o.year);
    const a = o.journal ?? o.booktitle ?? o.publisher;
    return a && (h.journal = a), h;
  });
}
function j(s) {
  const t = [s.author, s.year ? `(${s.year})` : ""].filter(Boolean).join(" "), i = [];
  return t && i.push(t), s.title && i.push(`*${s.title}*`), s.journal && i.push(s.journal), i.join(". ");
}
export {
  j as formatReference,
  W as parseBibFile,
  C as rebuildBibIndex
};
