import { getCommandSignature as a } from "./package-db.js";
class m {
  commandArguments = /* @__PURE__ */ new Map();
  resolvers = /* @__PURE__ */ new Map();
  registerCommand(e, r) {
    this.commandArguments.set(e, r);
  }
  getCommandArguments(e) {
    return this.commandArguments.get(e) ?? a(e);
  }
  registerResolver(e, r) {
    this.resolvers.set(e, r);
  }
  hasResolver(e) {
    return this.resolvers.has(e);
  }
  resolve(e, r) {
    if (r.cancellationToken?.isCancellationRequested) return [];
    const t = this.resolvers.get(e.domain);
    if (!t) return [];
    const n = t(e, r);
    return r.cancellationToken?.isCancellationRequested ? [] : n.map(
      (s) => s.replacementRange ? s : { ...s, replacementRange: e.replacementRange }
    );
  }
}
export {
  m as CompletionResolverRegistry
};
