//#region src/lsp/project-command-metadata.ts
function e(e, t, n) {
	let r = /* @__PURE__ */ new Map();
	for (let n of e.getCommandDefs(t)) {
		let e = r.has(n.name) || n.mayRedefine ? [] : n.arguments ?? [];
		r.set(n.name, e), r.set(`${n.name}*`, n.acceptsStar ? e : []);
	}
	let i = [...[...e.getLoadedPackages(t)].map((e) => `package/${e}`), ...[...e.getLoadedClasses(t)].map((e) => `class/${e}`)];
	return { getCommandArguments: (e) => r.get(e) ?? n.getScopedCommandArguments(e, i) };
}
//#endregion
export { e as projectCommandMetadata };
