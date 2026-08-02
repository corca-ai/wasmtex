import { getCommandSignature as o } from "./package-db.js";
class m {
  commandArguments = /* @__PURE__ */ new Map();
  resolvers = /* @__PURE__ */ new Map();
  registerCommand(e, s) {
    this.commandArguments.set(e, s);
  }
  getCommandArguments(e) {
    return this.commandArguments.get(e) ?? o(e);
  }
  registerResolver(e, s) {
    this.resolvers.set(e, s);
  }
  hasResolver(e) {
    return this.resolvers.has(e);
  }
  resolve(e, s) {
    return this.resolveResult(e, s).items;
  }
  resolveResult(e, s) {
    if (s.cancellationToken?.isCancellationRequested)
      return { items: [], isIncomplete: !1 };
    const l = this.resolvers.get(e.domain);
    if (!l) return { items: [], isIncomplete: !1 };
    const r = l(e, s);
    if (s.cancellationToken?.isCancellationRequested)
      return { items: [], isIncomplete: !1 };
    const n = Array.isArray(r) ? { items: r, isIncomplete: !1 } : r;
    return {
      items: n.items.map(
        (t) => t.replacementRange ? t : { ...t, replacementRange: e.replacementRange }
      ),
      isIncomplete: n.isIncomplete
    };
  }
}
export {
  m as CompletionResolverRegistry
};
