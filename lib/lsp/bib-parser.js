import { buildLineStarts as e, offsetToLineCol as t } from "./source-position.js";
//#region src/lsp/bib-parser.ts
function n(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e.listFiles()) {
		if (!t.endsWith(".bib")) continue;
		let r = e.readFile(t);
		typeof r == "string" && n.set(t, u(r, t));
	}
	t.replaceBibFiles(n);
}
var r = (e) => e >= "a" && e <= "z" || e >= "A" && e <= "Z", i = (e) => e === " " || e === "	" || e === "\n" || e === "\r" || e === "\f" || e === "\v" || e > "" && /\s/.test(e), a = (e) => r(e) || e >= "0" && e <= "9" || e === "_" || e === "-" || e === ":" || e === ".", o = class {
	src;
	pos = 0;
	strings = /* @__PURE__ */ new Map();
	stringDefinitions = [];
	entries = [];
	constructor(e) {
		this.src = e;
	}
	parse() {
		for (; this.pos < this.src.length && this.skipToAt();) this.readEntryOrCommand();
		return this.entries;
	}
	getStrings() {
		return this.stringDefinitions;
	}
	skipToAt() {
		for (; this.pos < this.src.length && this.src[this.pos] !== "@";) this.pos++;
		return this.pos < this.src.length;
	}
	skipWs() {
		for (; this.pos < this.src.length && i(this.src[this.pos]);) this.pos++;
	}
	readName() {
		let e = this.pos;
		for (; this.pos < this.src.length && a(this.src[this.pos]);) this.pos++;
		return this.src.slice(e, this.pos);
	}
	readEntryOrCommand() {
		this.pos++;
		let e = this.readName().toLowerCase();
		this.skipWs();
		let t = this.src[this.pos];
		if (t !== "{" && t !== "(") return;
		let n = t === "{" ? "}" : ")";
		this.pos++, e === "string" ? this.readString() : e === "preamble" || e === "comment" ? this.skipBalanced() : this.readEntry(e, n);
	}
	readString() {
		this.skipWs();
		let e = this.pos, t = this.readName().toLowerCase();
		if (this.skipWs(), this.src[this.pos] === "=") {
			this.pos++;
			let n = this.readValue();
			this.strings.set(t, n), t && this.stringDefinitions.push({
				name: t,
				value: n,
				nameOffset: e
			});
		}
		this.skipBalanced();
	}
	readEntry(e, t) {
		this.skipWs();
		let n = this.pos, r = {
			type: e,
			key: this.readUntil([",", t]).trim(),
			keyOffset: n,
			fields: {}
		};
		this.src[this.pos] === "," && this.pos++, this.readFields(r, t), r.key && this.entries.push(r);
	}
	readFields(e, t) {
		for (; this.pos < this.src.length;) {
			if (this.skipWs(), this.src[this.pos] === t || this.pos >= this.src.length) {
				this.pos++;
				return;
			}
			let n = this.readName().toLowerCase();
			this.skipWs(), this.src[this.pos] === "=" ? (this.pos++, e.fields[n] = this.readValue()) : n || this.pos++, this.skipWs(), this.src[this.pos] === "," && this.pos++;
		}
	}
	readValue() {
		let e = [];
		for (;;) {
			this.skipWs();
			let t = this.src[this.pos];
			if (t === "{" || t === "\"") e.push(this.readDelimited());
			else if (t !== void 0 && a(t)) e.push(this.readBareValue());
			else break;
			if (this.skipWs(), this.src[this.pos] === "#") this.pos++;
			else break;
		}
		return e.join("");
	}
	readDelimited() {
		let e = this.src[this.pos] === "{" ? "}" : "\"", t = this.pos + 1;
		this.pos++;
		let n = +(e === "}");
		for (; this.pos < this.src.length;) {
			let t = this.src[this.pos];
			if (t === "\\") {
				this.pos += 2;
				continue;
			}
			if (t === "{" ? n++ : t === "}" && n > 0 && n--, t === e && (e === "\"" || n === 0)) break;
			this.pos++;
		}
		let r = this.src.slice(t, this.pos);
		return this.pos < this.src.length && this.pos++, r;
	}
	readBareValue() {
		let e = this.readName();
		return this.strings.get(e.toLowerCase()) ?? e;
	}
	readUntil(e) {
		let t = this.pos;
		for (; this.pos < this.src.length && !e.includes(this.src[this.pos]);) this.pos++;
		return this.src.slice(t, this.pos);
	}
	skipBalanced() {
		let e = 1;
		for (; this.pos < this.src.length && e > 0;) {
			let t = this.src[this.pos];
			t === "{" || t === "(" ? e++ : (t === "}" || t === ")") && e--, this.pos++;
		}
	}
};
function s(e) {
	let t = new Map(e.map((e) => [e.key.toLowerCase(), e])), n = (e) => e ? t.get(e.toLowerCase()) : void 0;
	for (let t of e) c(t, n(t.fields.crossref)), c(t, n(t.fields.xdata));
}
function c(e, t) {
	if (t) for (let [n, r] of Object.entries(t.fields)) n in e.fields || (e.fields[n] = r);
}
function l(e) {
	return e.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}
function u(n, r) {
	let i = new o(n), a = i.parse();
	s(a);
	let c = e(n);
	return {
		entries: a.filter((e) => e.type !== "string" && e.type !== "preamble" && e.type !== "comment").map((e) => {
			let { line: n, column: i } = t(c, e.keyOffset), a = {};
			for (let [t, n] of Object.entries(e.fields)) a[t] = l(n);
			let o = {
				key: e.key,
				type: e.type,
				location: {
					file: r,
					line: n,
					column: i
				},
				fields: a
			};
			a.title && (o.title = a.title), a.author && (o.author = a.author), a.year && (o.year = a.year);
			let s = a.journal ?? a.booktitle ?? a.publisher;
			return s && (o.journal = s), o;
		}),
		strings: i.getStrings().map((e) => {
			let { line: n, column: i } = t(c, e.nameOffset);
			return {
				name: e.name,
				value: l(e.value),
				location: {
					file: r,
					line: n,
					column: i
				}
			};
		})
	};
}
function d(e, t) {
	return u(e, t).entries;
}
function f(e) {
	let t = [e.author, e.year ? `(${e.year})` : ""].filter(Boolean).join(" "), n = [];
	return t && n.push(t), e.title && n.push(`*${e.title}*`), e.journal && n.push(e.journal), n.join(". ");
}
//#endregion
export { f as formatReference, d as parseBibFile, u as parseBibFileData, n as rebuildBibIndex };
