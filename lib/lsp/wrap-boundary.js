import { tokenize as e } from "./latex-tokenizer.js";
import { getCommandByName as t } from "./latex-commands.js";
import { getCommandSignature as n } from "./package-db.js";
import { parseInvocation as r } from "./completion-context.js";
//#region src/lsp/wrap-boundary.ts
var i = (e, t, n) => e < n.endOffset && t > n.startOffset, a = (e, t, n) => e >= n.startOffset && t <= n.endOffset, o = (e, t, n) => e <= n.startOffset && t >= n.endOffset, s = (e, t, n) => i(e, t, n) && !a(e, t, n) && !o(e + 1, t - 1, n);
function c(e, t, n, r, a, o, s, c) {
	if (c?.isCancellationRequested) return {
		ok: !1,
		reason: "cancelled"
	};
	if (!l(e, t)) return {
		ok: !1,
		reason: "invalid-range"
	};
	if (e.length > 1e6 || t.endOffset - t.startOffset > 65536) return {
		ok: !1,
		reason: "limit"
	};
	if (!n || !r || r.excluded.some(([e, n]) => i(e, n, t))) return {
		ok: !1,
		reason: "unsafe-boundary"
	};
	let d = u(n, t);
	if (!d.ok) return d;
	let p = new f(e, t, r, a, o, d.context, s, n.mathRegions).check(c);
	return p ? {
		ok: !1,
		reason: p
	} : d;
}
function l(e, { startOffset: t, endOffset: n }) {
	return Number.isInteger(t) && Number.isInteger(n) && t >= 0 && t < n && n <= e.length && !p(e, t) && !p(e, n);
}
function u(e, t) {
	let n = "text";
	for (let r of e.mathRegions) if (i(r.fullRange.startOffset, r.fullRange.endOffset, t)) {
		if (!r.closed || !o(r.contentRange.startOffset, r.contentRange.endOffset, t)) return {
			ok: !1,
			reason: "unsupported-context"
		};
		n = "math";
	}
	return n === "math" && !d(e, t) ? {
		ok: !1,
		reason: "unsafe-boundary"
	} : {
		ok: !0,
		context: n
	};
}
function d(e, t) {
	return e.nodes.every((n) => {
		let r = n.ranges.full;
		return i(r.startOffset, r.endOffset, t) ? n.state !== "complete" || n.provenance?.editable === !1 ? !1 : n.kind !== "script" && n.kind !== "delimiter" || a(r.startOffset, r.endOffset, t) ? !0 : n.children.some((r) => {
			let i = e.nodes[r];
			return !i || !o(i.ranges.full.startOffset, i.ranges.full.endOffset, t) ? !1 : n.kind !== "script" || i.kind === "group" || i.ranges.full === n.ranges.nucleus || i.ranges.full.startOffset === n.ranges.nucleus?.startOffset && i.ranges.full.endOffset === n.ranges.nucleus.endOffset;
		}) : !0;
	});
}
var f = class {
	source;
	range;
	index;
	metadata;
	wrappers;
	context;
	blockedCommands;
	mathRegions;
	environments = [];
	closes;
	constructor(e, t, n, r, i, a, o, s) {
		this.source = e, this.range = t, this.index = n, this.metadata = r, this.wrappers = i, this.context = a, this.blockedCommands = o, this.mathRegions = s, this.closes = new Set(n.groups.values());
	}
	check(t) {
		for (let n of e(this.source)) {
			if (t?.isCancellationRequested) return "cancelled";
			if (this.index.masked[n.start] === " " && n.type !== "text") continue;
			let e = this.checkToken(n);
			if (e) return e;
		}
		return this.environments.length ? "unsafe-boundary" : null;
	}
	checkToken(e) {
		if (e.type === "open") {
			let t = this.index.groups.get(e.start);
			return t === void 0 || s(e.start, t + 1, this.range) ? "unsafe-boundary" : null;
		}
		if (e.type === "close") return this.closes.has(e.start) ? null : "unsafe-boundary";
		if (e.type !== "command") return null;
		if (i(e.start, e.end, this.range) && !a(e.start, e.end, this.range)) return "unsafe-boundary";
		let t = r(this.index.masked, e, this.metadata, (e, t, n = !1) => {
			let r = (n ? this.index.balancedGroups : this.index.groups).get(t);
			return r === void 0 ? {
				closed: !1,
				contentEnd: this.source.length,
				end: this.source.length
			} : {
				closed: !0,
				contentEnd: r,
				end: r + 1
			};
		});
		return e.value === "begin" || e.value === "end" ? this.checkEnvironment(e, t) : this.checkCommand(e, t);
	}
	checkEnvironment(e, t) {
		let n = t?.groups[0];
		if (!n?.closed) return "unsafe-boundary";
		let r = this.source.slice(n.contentStart, n.contentEnd);
		return !/^[A-Za-z0-9@:_*-]+$/.test(r) || i(e.start, n.end, this.range) && !a(e.start, n.end, this.range) ? "unsafe-boundary" : r === "document" && i(e.start, n.end, this.range) ? "unsupported-context" : e.value === "begin" ? (this.environments.push({
			name: r,
			start: e.start,
			body: n.end,
			supported: r !== "aligned" || t?.groups[1]?.delimiter !== "optional"
		}), null) : this.checkEnvironmentEnd(e, r, n.end);
	}
	checkEnvironmentEnd(e, t, n) {
		let r = this.environments.pop();
		return !r || r.name !== t ? "unsafe-boundary" : i(r.start, n, this.range) ? !r.supported || !this.environmentContextMatches(t, r.body, e.start) ? "unsupported-context" : a(r.start, n, this.range) || o(r.body, e.start, this.range) ? null : "unsafe-boundary" : null;
	}
	environmentContextMatches(e, t, n) {
		if (e === "document") return !0;
		let r = this.wrappers.find((t) => t.kind === "environment" && t.name === e);
		return r ? r.bodyContext === this.context || r.bodyContext === "text" && this.mathRegions.some((e) => e.closed && e.fullRange.startOffset >= t && e.fullRange.endOffset <= n && o(e.contentRange.startOffset, e.contentRange.endOffset, this.range)) : !1;
	}
	checkCommand(e, r) {
		let o = e.end + +(this.index.masked[e.end] === "*"), s = `${e.value}${o > e.end ? "*" : ""}`, c = r?.groups.filter((e) => i(e.open, e.end, this.range)) ?? [], l = a(e.start, o, this.range);
		if (!l && !c.length) return this.checkAdjacentArgument(e, s, r);
		if (this.blockedCommands.has(e.value)) return "unsafe-boundary";
		let u = this.metadata.getCommandArguments(s) ?? n(s);
		if (!u || !u.length && !t(s)) return "unsafe-boundary";
		if (!l) return this.checkContainer(s, c);
		let d = r?.groups.filter((e) => e.signatureIndex !== void 0) ?? [], f = (d.at(-1)?.signatureIndex ?? -1) + 1;
		return d.some((e) => !e.closed || !a(e.open, e.end, this.range)) || u.slice(f).some((e) => e.kind === "required") ? "unsafe-boundary" : null;
	}
	checkAdjacentArgument(e, t, r) {
		if (r || e.end > this.range.startOffset || this.source.slice(e.end, this.range.startOffset).trim()) return null;
		if (this.blockedCommands.has(e.value)) return "unsafe-boundary";
		let i = this.metadata.getCommandArguments(t) ?? n(t);
		return !i || i.some((e) => e.kind === "required") ? "unsafe-boundary" : null;
	}
	checkContainer(e, t) {
		let n = t.find((e) => o(e.contentStart, e.contentEnd, this.range)), r = this.wrappers.find((t) => t.kind === "command" && t.name === e);
		return !n?.closed || n.signatureIndex === void 0 || !r || n.spec.valueKind && n.spec.valueKind !== "free-text" ? "unsupported-context" : r.context === this.context ? null : "unsupported-context";
	}
};
function p(e, t) {
	let n = e.charCodeAt(t - 1), r = e.charCodeAt(t);
	return n >= 55296 && n <= 56319 && r >= 56320 && r <= 57343;
}
//#endregion
export { c as wrapBoundary };
