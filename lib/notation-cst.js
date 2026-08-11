import { getMathCommandSpec as e } from "./math-command-spec.js";
//#region src/notation-cst.ts
var t = /* @__PURE__ */ new Set([
	"align",
	"align*",
	"alignat",
	"alignat*",
	"aligned",
	"alignedat",
	"array",
	"cases",
	"flalign",
	"flalign*",
	"gather",
	"gather*",
	"gathered",
	"matrix",
	"multline",
	"multline*",
	"pmatrix",
	"smallmatrix",
	"split",
	"vmatrix",
	"Vmatrix"
]), n = 1e4, r = 128, i = 8;
function a(e, t, n, r = () => void 0) {
	let i = [], a = [], s = 0;
	for (let l of n) {
		r();
		let n = o(t, s, l.contentRange, r);
		s = n.cursor;
		let d = new c(e, u(n.tokens, l.contentRange, r), i, r).parseRoot(l.contentRange, l.delimiter);
		a.push({
			node: d,
			delimiter: l.delimiter,
			fullRange: l.fullRange,
			contentRange: l.contentRange,
			state: l.closed ? "complete" : "incomplete"
		});
	}
	return {
		nodes: i,
		mathRoots: a
	};
}
function o(e, t, n, r) {
	let i = t;
	for (; e[i] && e[i].end <= n.startOffset;) i++;
	let a = [];
	for (let t = i; t < e.length; t++) {
		t & 255 || r();
		let i = e[t];
		if (i.start >= n.endOffset) break;
		i.end > n.startOffset && a.push(i);
	}
	return {
		cursor: i,
		tokens: a
	};
}
function s(e, t) {
	let n = _(e.mathRoots, t, (e) => e.contentRange);
	if (n < 0) return [];
	let r = [e.mathRoots[n].node];
	for (;;) {
		let n = e.nodes[r[r.length - 1]];
		if (!n) return r;
		let i = _(n.children, t, (t) => e.nodes[t].ranges.full);
		if (i < 0) return r;
		r.push(n.children[i]);
	}
}
var c = class {
	document;
	input;
	nodes;
	checkCancelled;
	cursor = 0;
	operations = 0;
	constructor(e, t, n, r) {
		this.document = e, this.input = t, this.nodes = n, this.checkCancelled = r;
	}
	parseRoot(e, n) {
		let r = this.parseSequence(0), i = t.has(p(n)) ? this.groupAlignment(r) : r;
		return this.addNode({
			kind: "sequence",
			children: i,
			range: e,
			state: "complete"
		});
	}
	parseSequence(e, t) {
		let n = [];
		for (; this.cursor < this.input.length;) {
			this.checkpoint();
			let r = this.input[this.cursor];
			if (r.kind === "close" && t === "}" || r.kind === "character" && r.value === t) break;
			this.appendSequenceItem(n, r, e);
		}
		return n;
	}
	appendSequenceItem(e, t, n) {
		if (t.kind === "character" && t.value === "'") this.attachPrime(e);
		else if (t.kind === "character" && (t.value === "_" || t.value === "^")) this.attachScript(e, n);
		else {
			let t = this.parseAtom(n);
			t && e.push(t.node);
		}
	}
	parseAtom(e) {
		let t = this.input[this.cursor];
		if (!t) return null;
		if (this.nodes.length >= 9870) {
			let e = {
				startOffset: t.range.startOffset,
				endOffset: this.input[this.input.length - 1]?.range.endOffset ?? t.range.endOffset
			};
			return this.cursor = this.input.length, this.opaque(e, "truncated");
		}
		return e >= r ? (this.cursor++, this.opaque(t.range, "truncated")) : t.kind === "open" ? this.parseGroup(e + 1) : t.kind === "close" ? this.unexpectedClose(t) : t.kind === "command" ? this.parseCommand(e + 1) : t.value === "(" || t.value === "[" ? this.parseDelimiter(e + 1) : (this.cursor++, t.value === "&" || t.value === "\\" ? this.atom("alignment", t.range, t.value) : this.atom("token", t.range, t.value));
	}
	parseGroup(e) {
		let t = this.input[this.cursor++], n = this.parseSequence(e, "}"), r = this.input[this.cursor], i = r?.kind === "close";
		return i && this.cursor++, this.container("group", t, n, i ? r.range.endOffset : void 0);
	}
	parseDelimiter(e) {
		let t = this.input[this.cursor++], n = t.value === "(" ? ")" : "]", r = this.parseSequence(e, n), i = this.input[this.cursor], a = i?.kind === "character" && i.value === n;
		return a && this.cursor++, this.container("delimiter", t, r, a ? i.range.endOffset : void 0, a ? `${t.value}${n}` : t.value);
	}
	container(e, t, n, r, i) {
		let a = {
			startOffset: t.range.startOffset,
			endOffset: r ?? this.lastEnd(t.range.endOffset, n)
		};
		return {
			node: this.addNode({
				kind: e,
				children: n,
				range: a,
				state: r === void 0 ? "incomplete" : "complete",
				...i === void 0 ? {} : { name: i }
			}),
			range: a
		};
	}
	parseCommand(t) {
		let n = this.input[this.cursor++];
		if (n.value === "begin") return this.parseEnvironment(n, t);
		let r = e(n.value);
		if (r) return this.parseSpecifiedCommand(n, r, t);
		let a = [];
		for (let e = 0; e < i && this.input[this.cursor]?.kind === "open"; e++) a.push(this.parseGroup(t).node);
		let o = {
			startOffset: n.range.startOffset,
			endOffset: this.lastEnd(n.range.endOffset, a)
		};
		return {
			node: this.addNode({
				kind: "command",
				children: a,
				range: o,
				state: "opaque",
				name: n.value,
				command: n.range,
				nameRange: m(n)
			}),
			range: o
		};
	}
	parseSpecifiedCommand(e, t, n) {
		let r = t.acceptsStar && this.input[this.cursor]?.value === "*" ? this.input[this.cursor++] : void 0, i = this.parseSpecifiedArguments(t.arguments, n), a = i.arguments.map((e) => e.node), o = {
			startOffset: e.range.startOffset,
			endOffset: this.lastEnd(r?.range.endOffset ?? e.range.endOffset, a)
		}, s = i.arguments.find((e) => e.role === "name"), c = t.behavior === "named-surface" && s ? g(this.nodes[s.node], s.range) : m(e), l = i.arguments.find((e) => e.role === "nucleus");
		return {
			node: this.addNode({
				kind: f(t),
				children: a,
				range: o,
				state: i.missingRequired ? "incomplete" : t.expansion === "opaque" ? "opaque" : "complete",
				name: t.behavior === "named-surface" && s ? this.document.content.slice(c.startOffset, c.endOffset) : e.value,
				command: {
					startOffset: e.range.startOffset,
					endOffset: r?.range.endOffset ?? e.range.endOffset
				},
				nameRange: c,
				...i.arguments.length === 0 ? {} : { arguments: i.arguments },
				...l ? { nucleus: l.range } : {},
				...t.mathClass ? { mathClass: t.mathClass } : {}
			}),
			range: o
		};
	}
	parseSpecifiedArguments(e, t) {
		let n = [], r = !1;
		for (let i of e) {
			let e = this.parseSpecifiedArgument(i, t);
			e.argument && n.push(e.argument), r ||= e.missingRequired;
		}
		return {
			arguments: n,
			missingRequired: r
		};
	}
	parseSpecifiedArgument(e, t) {
		let n = this.input[this.cursor];
		if (e.syntax === "optional" && n?.value !== "[") return { missingRequired: !1 };
		if (!n || n.kind === "close") return { missingRequired: e.syntax === "required" };
		let r = e.consumption === "token" ? this.parseStructuralToken(t) : this.parseAtom(t);
		return r ? {
			argument: {
				node: r.node,
				role: e.role,
				syntax: e.syntax,
				range: r.range
			},
			missingRequired: !1
		} : { missingRequired: e.syntax === "required" };
	}
	parseStructuralToken(e) {
		let t = this.input[this.cursor];
		return t ? t.kind === "command" ? this.parseCommand(e) : (this.cursor++, this.atom("token", t.range, t.value)) : null;
	}
	parseEnvironment(e, n) {
		let r = h(this.document.content, this.input, this.cursor);
		if (!r) return {
			node: this.addNode({
				kind: "environment",
				children: [],
				range: e.range,
				state: "incomplete",
				command: e.range
			}),
			range: e.range
		};
		this.cursor = r.endCursor;
		let i = [], a = null;
		for (; this.cursor < this.input.length;) {
			if (a = this.environmentEnd(r.text), a) {
				this.cursor = a.endCursor;
				break;
			}
			let e = this.input[this.cursor];
			this.appendSequenceItem(i, e, n);
		}
		let o = {
			startOffset: e.range.startOffset,
			endOffset: a?.range.endOffset ?? this.lastEnd(r.range.endOffset, i)
		}, s = t.has(r.text) ? this.groupAlignment(i) : i;
		return {
			node: this.addNode({
				kind: "environment",
				children: s,
				range: o,
				state: a ? "complete" : "incomplete",
				name: r.text,
				command: e.range,
				nameRange: r.innerRange
			}),
			range: o
		};
	}
	groupAlignment(e) {
		let t = e.filter((e) => this.isAlignmentSeparator(e)).length;
		if (t === 0 || this.nodes.length + t * 2 + 2 > n) return [...e];
		let r = [], i = [], a = [], o = () => {
			a.length !== 0 && (i.push(this.containerFromChildren("cell", a)), a = []);
		}, s = () => {
			o(), i.length !== 0 && (r.push(this.containerFromChildren("row", i)), i = []);
		};
		for (let t of e) {
			let e = this.nodes[t];
			if (e.kind !== "alignment") {
				a.push(t);
				continue;
			}
			o(), i.push(t), e.name === "\\" && s();
		}
		return s(), r;
	}
	isAlignmentSeparator(e) {
		let t = this.nodes[e];
		return t?.kind === "alignment" && (t.name === "\\" || t.text === "&");
	}
	containerFromChildren(e, t) {
		let n = this.nodes[t[0]].ranges.full, r = this.nodes[t[t.length - 1]].ranges.full;
		return this.addNode({
			kind: "alignment",
			children: [...t],
			range: {
				startOffset: n.startOffset,
				endOffset: r.endOffset
			},
			state: t.every((e) => this.nodes[e].state === "complete") ? "complete" : "incomplete",
			name: e
		});
	}
	environmentEnd(e) {
		let t = this.input[this.cursor];
		if (t?.kind !== "command" || t.value !== "end") return null;
		let n = h(this.document.content, this.input, this.cursor + 1);
		return n?.complete && n.text === e ? n : null;
	}
	attachScript(e, t) {
		let n = this.input[this.cursor++], r = e.pop(), i = this.parseAtom(t + 1);
		if (r === void 0) {
			e.push(this.addNode({
				kind: "error",
				children: i ? [i.node] : [],
				range: {
					startOffset: n.range.startOffset,
					endOffset: i?.range.endOffset ?? n.range.endOffset
				},
				state: "incomplete",
				name: n.value === "_" ? "subscript" : "superscript",
				command: n.range
			}));
			return;
		}
		let a = this.nodes[r].ranges.full, o = {
			startOffset: a.startOffset,
			endOffset: i?.range.endOffset ?? n.range.endOffset
		};
		e.push(this.addNode({
			kind: "script",
			children: i ? [r, i.node] : [r],
			range: o,
			state: i ? "complete" : "incomplete",
			name: n.value === "_" ? "subscript" : "superscript",
			command: n.range,
			nucleus: a
		}));
	}
	attachPrime(e) {
		let t = e.pop(), n = [], r, i;
		for (; this.input[this.cursor]?.kind === "character" && this.input[this.cursor]?.value === "'";) {
			let e = this.input[this.cursor++];
			r ??= e.range, i = e.range, n.push(this.atom("token", e.range, e.value).node);
		}
		if (t === void 0 || !r || !i) {
			for (let t of n) e.push(t);
			return;
		}
		let a = this.nodes[t].ranges.full;
		e.push(this.addNode({
			kind: "script",
			children: [t, ...n],
			range: {
				startOffset: a.startOffset,
				endOffset: i.endOffset
			},
			state: "complete",
			name: "prime",
			command: {
				startOffset: r.startOffset,
				endOffset: i.endOffset
			},
			nucleus: a
		}));
	}
	unexpectedClose(e) {
		return this.cursor++, this.atom("error", e.range, e.value, "incomplete");
	}
	atom(e, t, n, r = "complete") {
		let i = e === "token" ? l(n) : void 0;
		return {
			node: this.addNode({
				kind: e,
				children: [],
				range: t,
				state: r,
				text: n,
				...i ? {
					lexicalClass: i.lexicalClass,
					mathClass: i.mathClass
				} : {}
			}),
			range: t
		};
	}
	opaque(e, t) {
		return {
			node: this.addNode({
				kind: "opaque",
				children: [],
				range: e,
				state: t
			}),
			range: e
		};
	}
	addNode(e) {
		let t = this.nodes.length;
		this.nodes.push({
			kind: e.kind,
			parent: null,
			children: e.children,
			ranges: {
				full: e.range,
				...e.command ? { command: e.command } : {},
				...e.nameRange ? { name: e.nameRange } : {},
				...e.nucleus ? { nucleus: e.nucleus } : {}
			},
			state: e.state,
			...e.name === void 0 ? {} : { name: e.name },
			...e.text === void 0 ? {} : { text: e.text },
			...e.arguments === void 0 ? {} : { arguments: e.arguments },
			...e.lexicalClass === void 0 ? {} : { lexicalClass: e.lexicalClass },
			...e.mathClass === void 0 ? {} : { mathClass: e.mathClass }
		});
		for (let n of e.children) this.nodes[n].parent = t;
		return t;
	}
	lastEnd(e, t) {
		let n = t[t.length - 1];
		return n === void 0 ? e : this.nodes[n].ranges.full.endOffset;
	}
	checkpoint() {
		this.operations++ & 255 || this.checkCancelled();
	}
};
function l(e) {
	return /^[0-9.]+$/u.test(e) && /[0-9]/u.test(e) ? {
		lexicalClass: "number",
		mathClass: "ordinary"
	} : /\p{L}/u.test(e) ? {
		lexicalClass: "identifier",
		mathClass: "ordinary"
	} : "=<>".includes(e) ? {
		lexicalClass: "operator",
		mathClass: "relation"
	} : "+-*/".includes(e) ? {
		lexicalClass: "operator",
		mathClass: "binary"
	} : ",:;".includes(e) ? {
		lexicalClass: "punctuation",
		mathClass: "punctuation"
	} : {
		lexicalClass: "other",
		mathClass: "ordinary"
	};
}
function u(e, t, n) {
	let r = [];
	for (let [i, a] of e.entries()) {
		i & 255 || n();
		let e = Math.max(a.start, t.startOffset), o = Math.min(a.end, t.endOffset);
		if (!(o <= e || a.type === "comment" || a.type === "verb")) {
			if (a.type === "command" || a.type === "open" || a.type === "close") {
				r.push({
					kind: a.type,
					value: a.value,
					range: {
						startOffset: e,
						endOffset: o
					}
				});
				continue;
			}
			d(a.value, a.start, t, r, n);
		}
	}
	return r;
}
function d(e, t, n, r, i) {
	let a = t, o = 0;
	for (let t of e) {
		o++ & 255 || i();
		let e = a + t.length;
		n.startOffset <= a && e <= n.endOffset && !/\s/u.test(t) && r.push({
			kind: "character",
			value: t,
			range: {
				startOffset: a,
				endOffset: e
			}
		}), a = e;
	}
}
function f(e) {
	return e.behavior === "modifier" ? "modifier" : e.behavior === "style" || e.behavior === "text" ? "style" : e.behavior === "named-surface" ? "named-operator" : e.behavior === "delimiter" ? "delimiter" : e.behavior === "alignment" ? "alignment" : "command";
}
function p(e) {
	return /^\\begin\{([^{}]+)\}$/u.exec(e)?.[1] ?? "";
}
function m(e) {
	return {
		startOffset: Math.min(e.range.startOffset + 1, e.range.endOffset),
		endOffset: e.range.endOffset
	};
}
function h(e, t, n) {
	let r = t[n];
	if (r?.kind !== "open") return null;
	let i = 1;
	for (let a = n + 1; a < t.length; a++) {
		let n = t[a];
		if (n.kind === "open") i++;
		else if (n.kind === "close" && --i === 0) {
			let t = {
				startOffset: r.range.endOffset,
				endOffset: n.range.startOffset
			};
			return {
				range: {
					startOffset: r.range.startOffset,
					endOffset: n.range.endOffset
				},
				innerRange: t,
				text: e.slice(t.startOffset, t.endOffset),
				endCursor: a + 1,
				complete: !0
			};
		}
	}
	let a = t[t.length - 1]?.range.endOffset ?? r.range.endOffset, o = {
		startOffset: r.range.endOffset,
		endOffset: a
	};
	return {
		range: {
			startOffset: r.range.startOffset,
			endOffset: a
		},
		innerRange: o,
		text: e.slice(o.startOffset, o.endOffset),
		endCursor: t.length,
		complete: !1
	};
}
function g(e, t) {
	return e.kind === "group" ? {
		startOffset: Math.min(t.startOffset + 1, t.endOffset),
		endOffset: Math.max(t.startOffset, t.endOffset - +(e.state === "complete"))
	} : t;
}
function _(e, t, n) {
	let r = 0, i = e.length - 1;
	for (; r <= i;) {
		let a = r + i >>> 1, o = n(e[a]);
		if (t < o.startOffset) i = a - 1;
		else if (t >= o.endOffset) r = a + 1;
		else return a;
	}
	return -1;
}
//#endregion
export { a as buildNotationCst, s as findLatexNotationPath };
