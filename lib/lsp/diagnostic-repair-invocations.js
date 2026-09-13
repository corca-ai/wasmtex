import { INLINE_VERB_COMMANDS as e } from "./latex-tokenizer.js";
import { getStructuralSelectionIndex as t } from "./structural-selection.js";
import { consumeRepairArguments as n } from "./diagnostic-repair-arguments.js";
//#region src/lsp/diagnostic-repair-invocations.ts
function r(e, n, r, a) {
	let o = t(n);
	if (!o || e.length > 1e6 || o.commands.length > 1e4) return [];
	let s = new i(e, o, r);
	for (let e of o.commands) {
		if (a?.isCancellationRequested) return [];
		s.visit(e);
	}
	return s.invocations;
}
var i = class {
	source;
	index;
	metadata;
	invocations = [];
	commands;
	consumedCommands = /* @__PURE__ */ new Set();
	groupStarts;
	nextGroup = 0;
	enclosing = [];
	opaque = [];
	constructor(e, t, n) {
		this.source = e, this.index = t, this.metadata = n, this.commands = new Map(t.commands.map((e) => [e.start, e])), this.groupStarts = [...t.groups.keys()].filter((e) => t.masked[e] === "{").sort((e, t) => e - t);
	}
	visit(t) {
		if (this.advanceGroups(t.start), e.has(t.value) || (this.opaque = this.opaque.filter((e) => e.end > t.start), this.consumedCommands.has(t.start) || this.opaque.some((e) => t.start > e.start))) return;
		let r = this.source[t.end] === "*" && this.metadata.getCommandArguments(`${t.value}*`) !== void 0, i = `${t.value}${r ? "*" : ""}`, a = this.metadata.getCommandArguments(i);
		if (!a) {
			this.excludeUnknownGroups(t);
			return;
		}
		let o = n(this.source, this.index, this.commands, t.end + Number(r), a);
		if (!o) {
			this.excludeUnknownGroups(t);
			return;
		}
		this.recordOwnership(o), this.invocations.push({
			token: t,
			name: i,
			signature: a,
			consumption: o
		});
	}
	excludeUnknownGroups(e) {
		this.opaque.push({
			start: e.start,
			end: this.enclosing.at(-1) ?? this.source.length
		});
	}
	advanceGroups(e) {
		for (; (this.groupStarts[this.nextGroup] ?? Infinity) < e;) {
			let e = this.groupStarts[this.nextGroup++];
			for (; (this.enclosing.at(-1) ?? Infinity) < e;) this.enclosing.pop();
			this.enclosing.push(this.index.groups.get(e));
		}
		for (; (this.enclosing.at(-1) ?? Infinity) < e;) this.enclosing.pop();
	}
	recordOwnership(e) {
		for (let t of e.arguments) t.commandOffset !== void 0 && this.consumedCommands.add(t.commandOffset), t.grouped && t.spec.valueKind !== "free-text" && this.opaque.push(t);
	}
};
//#endregion
export { r as repairInvocations };
