import { getCommandSignature as e } from "./package-db.js";
//#region src/lsp/completion-registry.ts
var t = class {
	commandArguments = /* @__PURE__ */ new Map();
	resolvers = /* @__PURE__ */ new Map();
	registerCommand(e, t) {
		this.commandArguments.set(e, t);
	}
	getCommandArguments(t) {
		return this.commandArguments.get(t) ?? e(t);
	}
	registerResolver(e, t) {
		this.resolvers.set(e, t);
	}
	hasResolver(e) {
		return this.resolvers.has(e);
	}
	resolve(e, t) {
		return this.resolveResult(e, t).items;
	}
	resolveResult(e, t) {
		if (t.cancellationToken?.isCancellationRequested) return {
			items: [],
			isIncomplete: !1
		};
		let n = this.resolvers.get(e.domain);
		if (!n) return {
			items: [],
			isIncomplete: !1
		};
		let r = n(e, t);
		if (t.cancellationToken?.isCancellationRequested) return {
			items: [],
			isIncomplete: !1
		};
		let i = Array.isArray(r) ? {
			items: r,
			isIncomplete: !1
		} : r;
		return {
			items: i.items.map((t) => t.replacementRange ? t : {
				...t,
				replacementRange: e.replacementRange
			}),
			isIncomplete: i.isIncomplete
		};
	}
};
//#endregion
export { t as CompletionResolverRegistry };
