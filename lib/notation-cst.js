//#region src/notation-cst.ts
var e = /* @__PURE__ */ new Map([
	["bar", "modifier"],
	["ddot", "modifier"],
	["dot", "modifier"],
	["hat", "modifier"],
	["overline", "modifier"],
	["tilde", "modifier"],
	["underline", "modifier"],
	["vec", "modifier"],
	["widehat", "modifier"],
	["widetilde", "modifier"],
	["mathbf", "style"],
	["mathbb", "style"],
	["mathcal", "style"],
	["mathfrak", "style"],
	["mathit", "style"],
	["mathrm", "style"],
	["mathsf", "style"],
	["mathtt", "style"],
	["operatorname", "named-operator"]
]), t = 128, n = 8;
function r(e, t, n, r = () => void 0) {
	let a = [], c = [], l = 0;
	for (let u of n) {
		r();
		let n = i(t, l, u.contentRange, r);
		l = n.cursor;
		let d = new o(e, s(n.tokens, u.contentRange, r), a, r).parseRoot(u.contentRange);
		c.push({
			node: d,
			delimiter: u.delimiter,
			fullRange: u.fullRange,
			contentRange: u.contentRange,
			state: u.closed ? "complete" : "incomplete"
		});
	}
	return {
		nodes: a,
		mathRoots: c
	};
}
function i(e, t, n, r) {
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
function a(e, t) {
	let n = f(e.mathRoots, t, (e) => e.contentRange);
	if (n < 0) return [];
	let r = [e.mathRoots[n].node];
	for (;;) {
		let n = e.nodes[r[r.length - 1]];
		if (!n) return r;
		let i = f(n.children, t, (t) => e.nodes[t].ranges.full);
		if (i < 0) return r;
		r.push(n.children[i]);
	}
}
var o = class {
	document;
	input;
	nodes;
	checkCancelled;
	cursor = 0;
	operations = 0;
	constructor(e, t, n, r) {
		this.document = e, this.input = t, this.nodes = n, this.checkCancelled = r;
	}
	parseRoot(e) {
		let t = this.parseSequence(0);
		return this.addNode({
			kind: "sequence",
			children: t,
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
			if (r.kind === "character" && (r.value === "_" || r.value === "^")) {
				this.attachScript(n, e);
				continue;
			}
			let i = this.parseAtom(e);
			i && n.push(i.node);
		}
		return n;
	}
	parseAtom(e) {
		let n = this.input[this.cursor];
		if (!n) return null;
		if (this.nodes.length >= 9870) {
			let e = {
				startOffset: n.range.startOffset,
				endOffset: this.input[this.input.length - 1]?.range.endOffset ?? n.range.endOffset
			};
			return this.cursor = this.input.length, this.opaque(e, "truncated");
		}
		return e >= t ? (this.cursor++, this.opaque(n.range, "truncated")) : n.kind === "open" ? this.parseGroup(e + 1) : n.kind === "close" ? this.unexpectedClose(n) : n.kind === "command" ? this.parseCommand(e + 1) : n.value === "(" || n.value === "[" ? this.parseDelimiter(e + 1) : (this.cursor++, n.value === "&" || n.value === "\\" ? this.atom("alignment", n.range, n.value) : this.atom("token", n.range, n.value));
	}
	parseGroup(e) {
		let t = this.input[this.cursor++], n = this.parseSequence(e, "}"), r = this.input[this.cursor], i = r?.kind === "close";
		i && this.cursor++;
		let a = i ? r.range.endOffset : this.lastEnd(t.range.endOffset, n), o = {
			startOffset: t.range.startOffset,
			endOffset: a
		};
		return {
			node: this.addNode({
				kind: "group",
				children: n,
				range: o,
				state: i ? "complete" : "incomplete"
			}),
			range: o
		};
	}
	parseDelimiter(e) {
		let t = this.input[this.cursor++], n = t.value === "(" ? ")" : "]", r = this.parseSequence(e, n), i = this.input[this.cursor], a = i?.kind === "character" && i.value === n;
		a && this.cursor++;
		let o = a ? i.range.endOffset : this.lastEnd(t.range.endOffset, r), s = {
			startOffset: t.range.startOffset,
			endOffset: o
		};
		return {
			node: this.addNode({
				kind: "delimiter",
				children: r,
				range: s,
				state: a ? "complete" : "incomplete",
				name: a ? `${t.value}${n}` : t.value
			}),
			range: s
		};
	}
	parseCommand(t) {
		let r = this.input[this.cursor++];
		if (r.value === "\\") return this.atom("alignment", r.range, r.value);
		if (r.value === "begin") return this.parseEnvironment(r, t);
		let i = e.get(r.value);
		if (i) return this.parseStructuralCommand(r, i, t);
		let a = [];
		for (let e = 0; e < n && this.input[this.cursor]?.kind === "open"; e++) a.push(this.parseGroup(t).node);
		let o = {
			startOffset: r.range.startOffset,
			endOffset: this.lastEnd(r.range.endOffset, a)
		};
		return {
			node: this.addNode({
				kind: "command",
				children: a,
				range: o,
				state: "opaque",
				name: r.value,
				command: r.range,
				nameRange: l(r)
			}),
			range: o
		};
	}
	parseStructuralCommand(e, t, n) {
		let r = t === "named-operator" && this.input[this.cursor]?.value === "*" ? this.input[this.cursor++] : void 0, i = this.parseAtom(n), a = i ? [i.node] : [], o = {
			startOffset: e.range.startOffset,
			endOffset: i?.range.endOffset ?? r?.range.endOffset ?? e.range.endOffset
		}, s = t === "named-operator" && i ? d(this.nodes[i.node], i.range) : l(e);
		return {
			node: this.addNode({
				kind: t,
				children: a,
				range: o,
				state: i ? "complete" : "incomplete",
				name: t === "named-operator" && i ? this.document.content.slice(s.startOffset, s.endOffset) : e.value,
				command: {
					startOffset: e.range.startOffset,
					endOffset: r?.range.endOffset ?? e.range.endOffset
				},
				nameRange: s,
				...i ? { nucleus: i.range } : {}
			}),
			range: o
		};
	}
	parseEnvironment(e, t) {
		let n = u(this.document.content, this.input, this.cursor);
		if (!n) return {
			node: this.addNode({
				kind: "environment",
				children: [],
				range: e.range,
				state: "incomplete",
				command: e.range
			}),
			range: e.range
		};
		this.cursor = n.endCursor;
		let r = [], i = null;
		for (; this.cursor < this.input.length;) {
			if (i = this.environmentEnd(n.text), i) {
				this.cursor = i.endCursor;
				break;
			}
			let e = this.input[this.cursor];
			if (e.kind === "character" && (e.value === "_" || e.value === "^")) this.attachScript(r, t);
			else {
				let e = this.parseAtom(t);
				e && r.push(e.node);
			}
		}
		let a = {
			startOffset: e.range.startOffset,
			endOffset: i?.range.endOffset ?? this.lastEnd(n.range.endOffset, r)
		};
		return {
			node: this.addNode({
				kind: "environment",
				children: r,
				range: a,
				state: i ? "complete" : "incomplete",
				name: n.text,
				command: e.range,
				nameRange: n.innerRange
			}),
			range: a
		};
	}
	environmentEnd(e) {
		let t = this.input[this.cursor];
		if (t?.kind !== "command" || t.value !== "end") return null;
		let n = u(this.document.content, this.input, this.cursor + 1);
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
	unexpectedClose(e) {
		return this.cursor++, this.atom("error", e.range, e.value, "incomplete");
	}
	atom(e, t, n, r = "complete") {
		return {
			node: this.addNode({
				kind: e,
				children: [],
				range: t,
				state: r,
				text: n
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
		let t = this.nodes.length, n = this.source(e.range);
		this.nodes.push({
			kind: e.kind,
			parent: null,
			children: e.children,
			ranges: {
				full: e.range,
				editable: e.range,
				...e.command ? { command: e.command } : {},
				...e.nameRange ? { name: e.nameRange } : {},
				...e.nucleus ? { nucleus: e.nucleus } : {}
			},
			state: e.state,
			...e.name === void 0 ? {} : { name: e.name },
			...e.text === void 0 ? {} : { text: e.text },
			provenance: {
				origin: "source",
				source: n,
				editable: !0
			}
		});
		for (let n of e.children) this.nodes[n].parent = t;
		return t;
	}
	source(e) {
		return {
			fileId: this.document.fileId,
			path: this.document.path,
			range: e
		};
	}
	lastEnd(e, t) {
		let n = t[t.length - 1];
		return n === void 0 ? e : this.nodes[n].ranges.full.endOffset;
	}
	checkpoint() {
		this.operations++ & 255 || this.checkCancelled();
	}
};
function s(e, t, n) {
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
			c(a.value, a.start, t, r, n);
		}
	}
	return r;
}
function c(e, t, n, r, i) {
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
function l(e) {
	return {
		startOffset: Math.min(e.range.startOffset + 1, e.range.endOffset),
		endOffset: e.range.endOffset
	};
}
function u(e, t, n) {
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
function d(e, t) {
	return e.kind === "group" ? {
		startOffset: Math.min(t.startOffset + 1, t.endOffset),
		endOffset: Math.max(t.startOffset, t.endOffset - +(e.state === "complete"))
	} : t;
}
function f(e, t, n) {
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
export { r as buildNotationCst, a as findLatexNotationPath };
