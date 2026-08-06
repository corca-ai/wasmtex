import { CITE_CMDS as e, COMMAND_TOKEN as t, REF_CMDS as n } from "./latex-patterns.js";
import { LATEX_COMMANDS as r, LATEX_ENVIRONMENTS as i, getCommandByName as a, getEnvironmentByName as o } from "./latex-commands.js";
import { formatSignature as s, getShardEnvironments as c, parseSignature as ee } from "./package-db.js";
import { formatReference as te } from "./bib-parser.js";
import { registerBibCompletionResolvers as ne } from "./bib-completion.js";
import { completeColors as re } from "./color-completion.js";
import { analyzeCompletionContext as ie } from "./completion-context.js";
import { CompletionResolverRegistry as l } from "./completion-registry.js";
import { completeProjectFiles as u } from "./file-completion.js";
import { registerTexSemanticShard as ae } from "./semantic-catalog.js";
//#region src/lsp/neutral-providers.ts
var oe = class {
	provider;
	registry;
	registeredScopes = /* @__PURE__ */ new Set();
	constructor(e, t) {
		this.provider = e, this.registry = t;
	}
	syncProject(e, t, n, r) {
		return this.syncScopes([...[...e.getLoadedPackages(n)].map((e) => `package/${e}`), ...[...e.getLoadedClasses(n)].map((e) => `class/${e}`)], t, r);
	}
	syncScopes(e, t, n) {
		let r = [], i = !1, a = [...new Set(e)], o = /* @__PURE__ */ new Set();
		for (; a.length > 0;) {
			let e = a.shift();
			if (o.has(e)) continue;
			o.add(e);
			let s = this.provider.getState(e);
			if (s.status === "ready") {
				this.register(s.shard), r.push(s.shard);
				for (let e of s.shard.dependencies) a.push(`package/${e}`);
			} else if (s.status === "idle" || s.status === "loading" || s.status === "error") {
				i = !0;
				let r = this.provider.load(e, t).then((e) => {
					e.status === "ready" && this.register(e.shard);
				});
				n?.(r);
			}
		}
		return {
			shards: r,
			isIncomplete: i
		};
	}
	register(e) {
		this.registeredScopes.has(e.scope.id) || (ae(this.registry, e), this.registeredScopes.add(e.scope.id));
	}
}, d = /* @__PURE__ */ new WeakMap();
function f(e = {}) {
	let t = new l(), n = e.semanticCatalog ? new oe(e.semanticCatalog, t) : void 0;
	n && d.set(t, n), ne(t), t.registerResolver("command", (e, t) => {
		let r = n?.syncProject(t.index, t.cancellationToken, t.document.path, t.waitUntil);
		return {
			items: h(e.prefix, e.prefix.length, t.index, t.document.path),
			isIncomplete: r?.isIncomplete ?? !1
		};
	}), t.registerResolver("label", (e, t) => _(e.prefix, e.prefix.length, t.index, t.document.path)), t.registerResolver("citation", (e, t) => v(e.prefix, e.prefix.length, t.index, t.document.path)), t.registerResolver("environment", (e, t) => {
		let r = n?.syncProject(t.index, t.cancellationToken, t.document.path, t.waitUntil), i = y(e.prefix, e.prefix.length, t.index, e.type === "argument" && e.command === "begin", t.document.path);
		return x(i, e.prefix, e.prefix.length, r?.shards ?? []), {
			items: i,
			isIncomplete: r?.isIncomplete ?? !1
		};
	}), t.registerResolver("tex-class", H("tex-class", e.resourceCatalog)), t.registerResolver("tex-package", H("tex-package", e.resourceCatalog)), t.registerResolver("bib-style", H("bib-style", e.resourceCatalog)), t.registerResolver("biblatex-style", H("biblatex-style", e.resourceCatalog));
	let r = H("font-file", e.resourceCatalog);
	t.registerResolver("font-family", (e, t) => {
		let n = T(e, t, "font-family"), i = r(e, t), a = Array.isArray(i) ? {
			items: i,
			isIncomplete: !1
		} : i;
		return {
			items: U([...n, ...a.items]),
			isIncomplete: a.isIncomplete
		};
	}), t.registerResolver("boolean", (e) => ["true", "false"].filter((t) => t.startsWith(e.prefix)).map((t) => ({
		label: t,
		kind: "keyword",
		insertText: t,
		replaceLength: e.prefix.length
	}))), t.registerResolver("color", (e, t) => {
		if (e.type !== "argument" || e.argumentIndex > 0 && (e.command === "color" || e.command === "textcolor" || e.command === "colorbox")) return [];
		let r = n?.syncProject(t.index, t.cancellationToken, t.document.path, t.waitUntil);
		return {
			items: re(t, r?.shards ?? []),
			isIncomplete: r?.isIncomplete ?? !1
		};
	}), t.registerResolver("counter", (e, t) => T(e, t, "counter")), t.registerResolver("length", (e, t) => T(e, t, "length")), t.registerResolver("glossary-key", (e, t) => T(e, t, "glossary")), t.registerResolver("acronym-key", (e, t) => T(e, t, "acronym")), t.registerResolver("key-family", (e, t) => E(e, t)), t.registerResolver("key-value", (e, r) => e.type === "argument" ? pe(e, r, n, t) : []);
	for (let e of [
		"project-tex",
		"project-bib",
		"project-image",
		"project-listing",
		"project-data",
		"project-file"
	]) t.registerResolver(e, (t, n) => u(e, t.prefix, n.document.path, n.fs));
	return t;
}
function se(e, t, n) {
	d.get(e)?.syncProject(t, n);
}
var ce = f();
function p(e, t, n, r, i = {}) {
	let a = i.registry ?? ce;
	if (i.cancellationToken?.isCancellationRequested) return {
		items: [],
		isIncomplete: !1
	};
	let o = ie(e, t, a);
	return o ? a.resolveResult(o, {
		document: e,
		position: t,
		index: n,
		fs: r,
		...i.cancellationToken ? { cancellationToken: i.cancellationToken } : {},
		...i.waitUntil ? { waitUntil: i.waitUntil } : {}
	}) : {
		items: [],
		isIncomplete: !1
	};
}
async function le(e, t, n, r, i = {}) {
	let a = /* @__PURE__ */ new Set(), o = p(e, t, n, r, {
		...i,
		waitUntil: (e) => a.add(e)
	});
	return !o.isIncomplete || a.size === 0 || i.cancellationToken?.isCancellationRequested ? o : (await Promise.allSettled(a), i.cancellationToken?.isCancellationRequested ? {
		items: [],
		isIncomplete: !1
	} : p(e, t, n, r, i));
}
function m(e) {
	return e <= 0 ? "" : ` (${e} arg${e === 1 ? "" : "s"})`;
}
function ue(e, t) {
	let n = [];
	return e.documentation && n.push(e.documentation), e.package && n.push(t ? `Package: \`${e.package}\`` : `Requires \`\\usepackage{${e.package}}\``), n.join("\n\n");
}
function h(e, t, n, i) {
	let a = [], o = n.getLoadedPackages(i);
	for (let n of r) {
		if (!n.name.startsWith(e)) continue;
		let r = !n.package || o.has(n.package), i = {
			label: `\\${n.name}`,
			kind: "command",
			insertText: n.snippet.slice(1),
			snippet: !0,
			sortText: `${r ? "0a" : "0b"}_${n.name}`,
			replaceLength: t
		};
		n.detail && (i.detail = n.detail);
		let s = ue(n, r);
		s && (i.documentation = s), a.push(i);
	}
	for (let r of n.getCommandDefs(i)) r.name.startsWith(e) && a.push({
		label: `\\${r.name}`,
		kind: "variable",
		insertText: r.name,
		detail: `User command (${r.location.file}:${r.location.line})`,
		sortText: `1_${r.name}`,
		replaceLength: t
	});
	return g(a, e, t, n), a;
}
function de(e, t) {
	return e === "macro" ? `Package macro${m(t)}` : e === "primitive" ? "TeX primitive" : "Package command";
}
function fe(e, t) {
	let n = e;
	for (let e = 1; e <= t; e++) n += `{$${e}}`;
	return n;
}
function g(e, t, n, r) {
	let i = new Set(e.map((e) => e.label.slice(1)));
	for (let [a, o] of r.getEngineCommands()) {
		if (!a.startsWith(t) || i.has(a)) continue;
		let r = o.argCount > 0;
		e.push({
			label: `\\${a}`,
			kind: o.category === "primitive" ? "keyword" : "text",
			insertText: r ? fe(a, o.argCount) : a,
			snippet: r,
			detail: de(o.category, o.argCount),
			sortText: `2_${a}`,
			replaceLength: n
		});
	}
}
function _(e, t, n, r) {
	let i = [];
	for (let a of n.getAllLabels(r)) {
		if (!a.name.startsWith(e)) continue;
		let r = n.resolveLabel(a.name), o = `${a.location.file}:${a.location.line}`;
		i.push({
			label: a.name,
			kind: "reference",
			insertText: a.name,
			detail: r ? `[${r}] ${o}` : o,
			replaceLength: t
		});
	}
	return i;
}
function v(e, t, n, r) {
	let i = [], a = /* @__PURE__ */ new Set();
	for (let r of n.getAuxCitations()) r.startsWith(e) && (a.add(r), i.push({
		label: r,
		kind: "reference",
		insertText: r,
		detail: "Citation",
		replaceLength: t
	}));
	for (let o of n.getBibEntries(r)) {
		if (a.has(o.key) || !o.key.startsWith(e)) continue;
		let n = [o.author, o.year].filter(Boolean).join(", ");
		i.push({
			label: o.key,
			kind: "reference",
			insertText: o.key,
			detail: n || (o.title ?? o.type),
			replaceLength: t
		});
	}
	return i;
}
function y(e, t, n, r, a) {
	let o = [], s = /* @__PURE__ */ new Set();
	for (let n of i) {
		if (!n.name.startsWith(e)) continue;
		s.add(n.name);
		let i = {
			label: n.name,
			kind: "module",
			insertText: n.name,
			replaceLength: t
		};
		n.detail && (i.detail = n.detail), r && (i.sortText = `0_${n.name}`), o.push(i);
	}
	for (let r of n.getAllEnvironments(a)) !r.startsWith(e) || s.has(r) || (s.add(r), o.push({
		label: r,
		kind: "module",
		insertText: r,
		detail: "Used in project",
		sortText: `1_${r}`,
		replaceLength: t
	}));
	for (let e of n.getEnvironmentDefinitions(a)) {
		let t = o.find((t) => t.label === e.name);
		if (!t) continue;
		let n = `Project definition: ${e.location.file}:${e.location.line}`;
		t.documentation = [t.documentation, n].filter(Boolean).join("\n\n"), t.sortText = `0_${e.name}`;
	}
	return b(o, e, t, s, n), o;
}
function b(e, t, n, r, i) {
	let a = new Set(i.getEngineEnvironments());
	for (let e of c()) a.add(e);
	for (let o of a) {
		if (!o.startsWith(t) || r.has(o)) continue;
		let a = i.getEngineCommands().get(o)?.argCount ?? -1;
		e.push({
			label: o,
			kind: "module",
			insertText: o,
			detail: `Package environment${m(a)}`,
			sortText: `2_${o}`,
			replaceLength: n
		});
	}
}
function x(e, t, n, r) {
	let i = new Set(e.map((e) => e.insertText));
	for (let a of r) for (let r of a.environments) {
		if (!r.name.startsWith(t) || i.has(r.name)) continue;
		i.add(r.name);
		let o = {
			label: r.name,
			kind: "module",
			insertText: r.name,
			detail: `TeX Live ${a.texliveYear}: ${a.scope.name} environment`,
			sortText: `2_${r.name}`,
			replaceLength: n
		};
		r.doc && (o.documentation = r.doc), e.push(o);
	}
}
var S = {
	counter: [
		"page",
		"part",
		"chapter",
		"section",
		"subsection",
		"subsubsection",
		"paragraph",
		"subparagraph",
		"figure",
		"table",
		"equation",
		"footnote",
		"mpfootnote",
		"enumi",
		"enumii",
		"enumiii",
		"enumiv"
	],
	length: [
		"\\textwidth",
		"\\textheight",
		"\\linewidth",
		"\\columnwidth",
		"\\paperwidth",
		"\\paperheight",
		"\\parindent",
		"\\parskip",
		"\\baselineskip",
		"\\topmargin",
		"\\oddsidemargin",
		"\\evensidemargin"
	]
};
function C(e) {
	return e.map((e) => `${e.role}: ${e.location.file}:${e.location.line}` + (e.target ? ` (alias ${e.target})` : ""));
}
function w(e, t) {
	let n = e.index.getProjectValues(t, e.document.path);
	return t === "glossary" ? [...n, ...e.index.getProjectValues("acronym", e.document.path)] : n;
}
function T(e, t, n) {
	let r = /* @__PURE__ */ new Map();
	for (let e of w(t, n)) {
		let t = r.get(e.name) ?? [];
		t.push(e), r.set(e.name, t);
	}
	return [.../* @__PURE__ */ new Set([...S[n] ?? [], ...r.keys()])].filter((t) => t.startsWith(e.prefix)).sort().map((t) => {
		let i = r.get(t) ?? [], a = C(i);
		return {
			label: t,
			kind: n === "font-family" ? "text" : "variable",
			insertText: t,
			detail: a[0] ?? (n === "counter" || n === "length" ? "LaTeX kernel value" : n),
			...a.length > 0 ? { documentation: a.join("\n\n") } : {},
			sortText: `${i.length > 0 ? "0" : "1"}_${t}`,
			replaceLength: e.prefix.length
		};
	});
}
function E(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let e of t.index.getProjectKeys(t.document.path)) {
		let t = n.get(e.family) ?? [];
		t.push(e), n.set(e.family, t);
	}
	return [...n].filter(([t]) => t.startsWith(e.prefix)).sort(([e], [t]) => e.localeCompare(t)).map(([t, n]) => ({
		label: t,
		kind: "module",
		insertText: t,
		detail: `Project key family · ${n[0].location.file}:${n[0].location.line}`,
		documentation: `${n.length} statically recovered key(s)`,
		replaceLength: e.prefix.length
	}));
}
function D(e) {
	if (e.keyFamily === "class-options" || e.keyFamily === "package-options") {
		let t = e.keyFamily === "class-options" ? "class" : "package";
		return (e.selector?.values ?? []).map((e) => e.trim().replace(/\.(?:cls|sty)$/i, "")).filter(Boolean).map((e) => `${t}/${e}`);
	}
	let t = e.keyFamily?.split("/")[0]?.trim();
	return t ? [`package/${t}`] : [];
}
function O(e, t) {
	return e.keyFamily ? t.flatMap((t) => {
		let n = t.keyFamilies.find((t) => t.name === e.keyFamily);
		return n ? [{
			shard: t,
			keys: n.keys
		}] : [];
	}) : [];
}
function k(e, t) {
	let n = e.provenance.map((e) => `${e.evidence}: \`${e.sourcePath}\`${e.line ? `:${e.line}` : ""}`).join("\n\n");
	return [
		e.documentation,
		`Scopes: ${t.map((e) => `\`${e}\``).join(", ")}`,
		`Confidence: ${e.confidence}`,
		n
	].filter(Boolean).join("\n\n");
}
function A(e) {
	return e.value.type === "flag" ? { insertText: e.name } : {
		insertText: `${e.name}=\${1}`,
		snippet: !0
	};
}
function j(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let { shard: e, keys: r } of t) for (let t of r) {
		let r = n.get(t.name);
		r ? (r.scopes.push(e.scope.id), r.key.repeatable &&= t.repeatable) : n.set(t.name, {
			key: { ...t },
			scopes: [e.scope.id]
		});
	}
	return [...n.values()].filter(({ key: t }) => t.name.startsWith(e.prefix) && (t.repeatable || !e.usedKeys.includes(t.name))).map(({ key: t, scopes: n }) => ({
		label: t.name,
		kind: "keyword",
		...A(t),
		detail: `${t.value.type} key · ${n.join(", ")}`,
		documentation: k(t, n),
		sortText: `0_${t.name}`,
		replaceLength: e.prefix.length
	}));
}
function M(e) {
	return {
		boolean: "boolean",
		color: "color",
		file: "project-file",
		command: "command",
		"tex-class": "tex-class",
		"tex-package": "tex-package",
		"bib-style": "bib-style",
		"biblatex-style": "biblatex-style",
		"font-family": "font-family"
	}[e] ?? null;
}
function N(e, t) {
	return [...new Set(t.flatMap((e) => e.value.type === "enum" ? e.value.values ?? [] : []))].filter((t) => t.startsWith(e.prefix)).sort().map((t) => ({
		label: t,
		kind: "keyword",
		insertText: t,
		replaceLength: e.prefix.length
	}));
}
function P(e, t) {
	let n = e.prefix.startsWith("\\"), r = n ? e.prefix.slice(1) : e.prefix;
	return h(r, r.length, t.index, t.document.path).map((t) => ({
		...t,
		insertText: n ? `\\${t.insertText}` : t.insertText,
		replaceLength: e.prefix.length
	}));
}
function F(e, t, n, r) {
	if (r.some((e) => e.value.type === "enum")) return {
		items: N(e, r),
		isIncomplete: !1
	};
	if (r.some((e) => e.value.type === "command")) return {
		items: P(e, t),
		isIncomplete: !1
	};
	let i = r.map((e) => M(e.value.type)).find(Boolean);
	return i ? n.resolveResult({
		...e,
		domain: i,
		valueKind: i
	}, t) : {
		items: [],
		isIncomplete: !1
	};
}
function I(e) {
	let t = new Set((e.keyFamilySelector?.values ?? []).map((e) => e.trim().replace(/^\/+|\/+$/g, "")));
	e.keyFamily && t.add(e.keyFamily.replace(/^\/+|\/+$/g, ""));
	for (let n of e.usedKeys) n.endsWith("/.cd") && t.add(n.slice(0, -4).replace(/^\/+|\/+$/g, ""));
	return t;
}
function L(e, t) {
	let n = I(e);
	return t.index.getProjectKeys(t.document.path, n.size > 0 ? n : void 0);
}
function R(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let e of t) {
		let t = n.get(e.name) ?? [];
		t.push(e), n.set(e.name, t);
	}
	return [...n].filter(([t]) => t.startsWith(e.prefix) && !e.usedKeys.includes(t)).sort(([e], [t]) => e.localeCompare(t)).map(([t, n]) => {
		let r = n.at(-1), i = r.valueType !== "flag";
		return {
			label: t,
			kind: "keyword",
			insertText: i ? `${t}=\${1}` : t,
			...i ? { snippet: !0 } : {},
			detail: `${r.valueType} key · ${r.provenance === "runtime-observed" ? "runtime-observed" : "project"}/${r.family}`,
			documentation: n.map((e) => `${e.location.file}:${e.location.line}`).join("\n\n"),
			sortText: `00_${t}`,
			replaceLength: e.prefix.length
		};
	});
}
function z(e) {
	return {
		boolean: "boolean",
		color: "color",
		file: "project-file",
		command: "command"
	}[e.valueType] ?? null;
}
function B(e, t, n, r) {
	let i = r.at(-1);
	if (!i) return {
		items: [],
		isIncomplete: !1
	};
	let a = new Set(i.valueType === "enum" ? i.values ?? [] : []);
	if (a.size > 0) return {
		items: [...a].filter((t) => t.startsWith(e.prefix)).sort().map((t) => ({
			label: t,
			kind: "keyword",
			insertText: t,
			detail: `Project enum value for ${e.key}`,
			replaceLength: e.prefix.length
		})),
		isIncomplete: !1
	};
	let o = z(i);
	return o ? n.resolveResult({
		...e,
		domain: o,
		valueKind: o
	}, t) : {
		items: [],
		isIncomplete: !1
	};
}
function V(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !t.has(e.insertText) && (t.add(e.insertText), !0));
}
function pe(e, t, n, r) {
	let i = n?.syncScopes(D(e), t.cancellationToken, t.waitUntil) ?? {
		shards: [],
		isIncomplete: !1
	}, a = O(e, i.shards), o = L(e, t);
	if (e.keyValuePosition !== "value") return {
		items: V([...R(e, o), ...j(e, a)]),
		isIncomplete: i.isIncomplete
	};
	if (!e.key) return {
		items: [],
		isIncomplete: i.isIncomplete
	};
	let s = F(e, t, r, a.flatMap((t) => t.keys.filter((t) => t.name === e.key))), c = B(e, t, r, o.filter((t) => t.name === e.key));
	return {
		items: V([...c.items, ...s.items]),
		isIncomplete: i.isIncomplete || s.isIncomplete || c.isIncomplete
	};
}
var me = {
	"tex-class": /* @__PURE__ */ new Set(["cls"]),
	"tex-package": /* @__PURE__ */ new Set(["sty"]),
	"bib-style": /* @__PURE__ */ new Set(["bst"]),
	"biblatex-style": /* @__PURE__ */ new Set([
		"bbx",
		"cbx",
		"lbx"
	]),
	"font-file": /* @__PURE__ */ new Set([
		"otf",
		"ttf",
		"ttc"
	])
};
function he(e, t) {
	let n = e.lastIndexOf(".");
	return n < 0 || !me[t].has(e.slice(n + 1).toLowerCase()) ? null : e.slice(0, n);
}
function ge(e, t, n, r) {
	return r.listFiles().map((e) => ({
		path: e,
		name: he(e, n)
	})).filter((t) => t.name?.startsWith(e) === !0).map(({ path: e, name: r }) => ({
		label: r,
		kind: n === "font-file" ? "file" : "module",
		insertText: r,
		detail: `Project resource: ${e}`,
		sortText: `0_${r}`,
		replaceLength: t
	}));
}
function _e(e, t, n, r) {
	let i = r === "font-file" ? e.fileName : e.name;
	if (!i.startsWith(t)) return null;
	let a = {
		label: i,
		kind: r === "font-file" ? "file" : "module",
		insertText: i,
		detail: `TeX Live ${e.texliveYear}: ${e.texlivePackage} (${e.fileName})`,
		sortText: `1_${i}`,
		replaceLength: n
	};
	return e.documentationUrl && (a.documentation = `[Package documentation](${e.documentationUrl})\n\nSource: \`${e.sourcePath}\``), a;
}
function H(e, t) {
	return (n, r) => {
		let i = ge(n.prefix, n.prefix.length, e, r.fs);
		if (!t) return i;
		let a = t.getState(e);
		if (a.status === "idle" || a.status === "loading" || a.status === "error") {
			let n = t.load(e, r.cancellationToken);
			r.waitUntil?.(n), r.waitUntil;
		}
		if (a.status !== "ready") return {
			items: i,
			isIncomplete: a.status !== "mismatch"
		};
		let o = a.shard.resources.map((t) => _e(t, n.prefix, n.prefix.length, e)).filter((e) => e !== null);
		return {
			items: U([...i, ...o]),
			isIncomplete: !1
		};
	};
}
function U(e) {
	let t = /* @__PURE__ */ new Set();
	return e.filter((e) => !t.has(e.insertText) && (t.add(e.insertText), !0));
}
var ve = /\\(?:begin|end)\{(\w+\*?)\}/g, ye = RegExp(`\\\\(?:${n})\\{([^}]+)\\}`, "g"), be = RegExp(`\\\\(?:${e})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), xe = new RegExp(t, "g");
function W(e, t, n) {
	for (let r of e.matchAll(t)) if (n >= r.index && n < r.index + r[0].length) return r;
	return null;
}
function Se(e, t, n) {
	return {
		startLine: e,
		startColumn: t + 1,
		endLine: e,
		endColumn: t + n + 1
	};
}
function Ce(e, t, n) {
	let r = e.lineAt(t.line), i = t.column - 1, a = W(r, ve, i);
	if (a) return {
		contents: we(a[1], n),
		range: G(t.line, a)
	};
	let o = W(r, ye, i);
	if (o) return {
		contents: Te(Q(o, i) ?? o[1].trim(), n),
		range: G(t.line, o)
	};
	let s = W(r, be, i);
	if (s) return {
		contents: Ee(s[1], n),
		range: G(t.line, s)
	};
	let c = W(r, xe, i);
	if (c) {
		let e = De(c[1], n);
		return e ? {
			contents: e,
			range: G(t.line, c)
		} : null;
	}
	return null;
}
function G(e, t) {
	return Se(e, t.index, t[0].length);
}
function we(e, t) {
	let n = o(e);
	if (n) {
		let r = [`**${e}** environment`];
		return n.detail && r.push(n.detail), n.package && r.push(`Package: \`${n.package}\``), q(r, t.getEngineCommands().get(e)), r;
	}
	if (t.getEngineEnvironments().has(e) || c().has(e)) {
		let n = [`**${e}** — Package environment`];
		return q(n, t.getEngineCommands().get(e)), n;
	}
	return [`**${e}** environment`];
}
function Te(e, t) {
	let n = t.resolveLabel(e), r = t.findLabelDef(e), i = [n ? `**\\ref{${e}}** = ${n}` : `**\\ref{${e}}**`];
	return r && i.push(`Defined at ${r.location.file}:${r.location.line}`), i;
}
function Ee(e, t) {
	let n = [];
	for (let r of e.split(",")) {
		let e = r.trim(), i = t.findBibEntry(e);
		if (i) {
			let t = te(i);
			n.push(`**[${e}]** ${i.type}${t ? `\n\n${t}` : ""}`);
		} else n.push(`**[${e}]**`);
	}
	return n;
}
function De(e, t) {
	let n = a(e);
	if (n) {
		let r = [`**\\${e}**${n.detail ? ` — ${n.detail}` : ""}`], i = ee(n.snippet);
		return i.length && r.push(`\`${s(e, i)}\``), n.documentation && r.push(n.documentation), n.package && r.push(`Package: \`${n.package}\``), q(r, t.getEngineCommands().get(e)), r;
	}
	let r = t.findCommandDef(e);
	if (r) return [`**\\${e}** — User-defined command`, `Defined at ${r.location.file}:${r.location.line}`];
	let i = t.getEngineCommands().get(e);
	if (i) {
		let t = [`**\\${e}** — ${K(i.category)}`];
		return q(t, i), t;
	}
	return null;
}
function K(e) {
	return e === "macro" ? "Package macro" : e === "primitive" ? "TeX primitive" : "Package command";
}
function q(e, t) {
	!t || t.category !== "macro" || (t.argCount > 0 ? e.push(`Arguments: ${t.argCount}`) : t.argCount === 0 && e.push("Arguments: none"));
}
var J = RegExp(`\\\\(?:${n})\\{([^}]+)\\}`, "g"), Y = RegExp(`\\\\(?:${e})(?:\\[[^\\]]*\\])*\\{([^}]+)\\}`, "g"), X = new RegExp(t, "g");
function Z(e, t) {
	return {
		file: e,
		range: {
			startLine: t.line,
			startColumn: t.column,
			endLine: t.line,
			endColumn: t.column
		}
	};
}
function Q(e, t) {
	let n = e[1], r = e.index + e[0].lastIndexOf("{") + 1;
	for (let e of n.split(",")) {
		if (t >= r && t <= r + e.length) return e.trim() || null;
		r += e.length + 1;
	}
	return n.split(",")[0]?.trim() || null;
}
function Oe(e, t, n) {
	let r = e.lineAt(t.line), i = t.column - 1, a = W(r, J, i);
	if (a) {
		let e = Q(a, i), t = e ? n.findLabelDef(e) : null;
		return t ? Z(t.location.file, t.location) : null;
	}
	let o = W(r, Y, i);
	if (o) {
		let e = Q(o, i);
		if (!e) return null;
		let t = n.findBibEntry(e);
		if (t) return Z(t.location.file, t.location);
		let r = n.findBibitemDef(e);
		return r ? Z(r.location.file, r.location) : null;
	}
	let s = W(r, X, i);
	if (s) {
		let e = n.findCommandDef(s[1]);
		return e ? Z(e.location.file, e.location) : null;
	}
	return null;
}
function ke(e, t, n) {
	let r = e.lineAt(t.line), i = t.column - 1, a = W(r, /\\label\{([^}]+)\}/g, i);
	if (a) return n.getAllLabelRefs(a[1].trim()).map((e) => Z(e.location.file, e.location));
	let o = W(r, J, i);
	if (o) {
		let e = Q(o, i);
		if (!e) return [];
		let t = [], r = n.findLabelDef(e);
		r && t.push(Z(r.location.file, r.location));
		for (let r of n.getAllLabelRefs(e)) t.push(Z(r.location.file, r.location));
		return t;
	}
	let s = W(r, Y, i);
	if (s) {
		let e = Q(s, i);
		return e ? $(n.findAllOccurrences(e, "citation")) : [];
	}
	let c = W(r, X, i);
	return c && n.findCommandDef(c[1]) ? $(n.findAllOccurrences(c[1], "command")) : [];
}
function $(e) {
	return e.map((e) => ({
		file: e.filePath,
		range: {
			startLine: e.line,
			startColumn: e.column,
			endLine: e.line,
			endColumn: e.column + e.length
		}
	}));
}
//#endregion
export { f as createDefaultCompletionRegistry, se as preloadSemanticCatalog, p as provideCompletionResult, le as provideCompletionResultAsync, Oe as provideDefinition, Ce as provideHover, ke as provideReferences };
