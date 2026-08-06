import { getCommandByName as e } from "./latex-commands.js";
//#region src/lsp/package-db.ts
var t = (e, t, n = {}) => ({
	kind: "optional",
	placeholder: e,
	valueKind: t,
	...n
}), n = (e, t, n = {}) => ({
	kind: "required",
	placeholder: e,
	valueKind: t,
	...n
}), r = /* @__PURE__ */ new Map([
	["documentclass", [t("options", "key-value", {
		keyFamily: "class-options",
		list: !0,
		selectorArgumentIndex: 1
	}), n("class", "tex-class")]],
	["LoadClass", [t("options", "key-value", {
		keyFamily: "class-options",
		list: !0,
		selectorArgumentIndex: 1
	}), n("class", "tex-class")]],
	["usepackage", [t("options", "key-value", {
		keyFamily: "package-options",
		list: !0,
		selectorArgumentIndex: 1
	}), n("packages", "tex-package", { list: !0 })]],
	["RequirePackage", [t("options", "key-value", {
		keyFamily: "package-options",
		list: !0,
		selectorArgumentIndex: 1
	}), n("packages", "tex-package", { list: !0 })]],
	["begin", [n("environment", "environment")]],
	["end", [n("environment", "environment")]],
	["color", [t("model", "free-text"), n("color", "color")]],
	["textcolor", [
		t("model", "free-text"),
		n("color", "color"),
		n("text", "free-text")
	]],
	["colorbox", [
		t("model", "free-text"),
		n("color", "color"),
		n("text", "free-text")
	]],
	["fcolorbox", [
		n("frame color", "color"),
		n("background color", "color"),
		n("text", "free-text")
	]],
	["ref", [n("label", "label", { list: !0 })]],
	["eqref", [n("label", "label", { list: !0 })]],
	["pageref", [n("label", "label", { list: !0 })]],
	["autoref", [n("label", "label", { list: !0 })]],
	["cref", [n("labels", "label", { list: !0 })]],
	["Cref", [n("labels", "label", { list: !0 })]],
	["nameref", [n("label", "label", { list: !0 })]],
	["cite", [
		t("prenote", "free-text"),
		t("postnote", "free-text"),
		n("keys", "citation", { list: !0 })
	]],
	["citep", [
		t("prenote", "free-text"),
		t("postnote", "free-text"),
		n("keys", "citation", { list: !0 })
	]],
	["citet", [
		t("prenote", "free-text"),
		t("postnote", "free-text"),
		n("keys", "citation", { list: !0 })
	]],
	["parencite", [
		t("prenote", "free-text"),
		t("postnote", "free-text"),
		n("keys", "citation", { list: !0 })
	]],
	["textcite", [
		t("prenote", "free-text"),
		t("postnote", "free-text"),
		n("keys", "citation", { list: !0 })
	]],
	["autocite", [
		t("prenote", "free-text"),
		t("postnote", "free-text"),
		n("keys", "citation", { list: !0 })
	]],
	["nocite", [n("keys", "citation", { list: !0 })]],
	["input", [n("file", "project-tex")]],
	["include", [n("file", "project-tex")]],
	["subfile", [n("file", "project-tex")]],
	["bibliography", [n("files", "project-bib", { list: !0 })]],
	["addbibresource", [t("options", "key-value"), n("file", "project-bib")]],
	["addglobalbib", [t("options", "key-value"), n("file", "project-bib")]],
	["addsectionbib", [t("options", "key-value"), n("file", "project-bib")]],
	["bibliographystyle", [n("style", "bib-style")]],
	["setmainfont", [t("options", "key-value", {
		keyFamily: "fontspec/font",
		list: !0
	}), n("font", "font-family")]],
	["setsansfont", [t("options", "key-value", {
		keyFamily: "fontspec/font",
		list: !0
	}), n("font", "font-family")]],
	["setmonofont", [t("options", "key-value", {
		keyFamily: "fontspec/font",
		list: !0
	}), n("font", "font-family")]],
	["includegraphics", [t("options", "key-value", {
		keyFamily: "graphicx/includegraphics",
		list: !0
	}), n("image", "project-image")]],
	["includesvg", [t("options", "key-value"), n("image", "project-image")]],
	["lstinputlisting", [t("options", "key-value"), n("file", "project-listing")]],
	["inputminted", [
		t("options", "key-value"),
		n("language", "free-text"),
		n("file", "project-listing")
	]],
	["VerbatimInput", [t("options", "key-value"), n("file", "project-listing")]],
	["verbatiminput", [n("file", "project-listing")]],
	["csvreader", [
		t("options", "key-value"),
		n("file", "project-data"),
		n("assignments", "free-text"),
		n("command", "free-text")
	]],
	["DTLloaddb", [
		t("options", "key-value"),
		n("database", "free-text"),
		n("file", "project-data")
	]],
	["hypersetup", [n("options", "key-value", {
		keyFamily: "hyperref/hypersetup",
		list: !0
	})]],
	["geometry", [n("options", "key-value", {
		keyFamily: "geometry/geometry",
		list: !0
	})]],
	["tikzset", [n("options", "key-value", {
		keyFamily: "tikz/tikzset",
		list: !0
	})]],
	["pgfplotsset", [n("options", "key-value", {
		keyFamily: "pgfplots/pgfplotsset",
		list: !0
	})]],
	["sisetup", [n("options", "key-value", {
		keyFamily: "siunitx/sisetup",
		list: !0
	})]],
	["lstset", [n("options", "key-value", {
		keyFamily: "listings/lstset",
		list: !0
	})]],
	["setminted", [n("options", "key-value", {
		keyFamily: "minted/setminted",
		list: !0
	})]],
	["printbibliography", [t("options", "key-value", {
		keyFamily: "biblatex/printbibliography",
		list: !0
	})]],
	["setdefaultlanguage", [t("options", "key-value", {
		keyFamily: "polyglossia/setdefaultlanguage",
		list: !0
	}), n("language", "free-text")]],
	["newglossaryentry", [n("key", "free-text"), n("fields", "key-value", {
		keyFamily: "glossaries/newglossaryentry",
		list: !0
	})]],
	["longnewglossaryentry", [
		n("key", "free-text"),
		n("fields", "key-value"),
		n("description", "free-text")
	]],
	["newacronym", [
		t("options", "key-value"),
		n("key", "free-text"),
		n("abbreviation", "free-text"),
		n("long form", "free-text")
	]],
	["gls", [n("key", "glossary-key")]],
	["Gls", [n("key", "glossary-key")]],
	["glspl", [n("key", "glossary-key")]],
	["Glspl", [n("key", "glossary-key")]],
	["glsadd", [n("key", "glossary-key")]],
	["acrshort", [n("key", "acronym-key")]],
	["acrlong", [n("key", "acronym-key")]],
	["acrfull", [n("key", "acronym-key")]],
	["ac", [n("key", "acronym-key")]],
	["setcounter", [n("counter", "counter"), n("value", "number")]],
	["addtocounter", [n("counter", "counter"), n("value", "number")]],
	["stepcounter", [n("counter", "counter")]],
	["refstepcounter", [n("counter", "counter")]],
	["value", [n("counter", "counter")]],
	["counterwithin", [n("counter", "counter"), n("within", "counter")]],
	["counterwithout", [n("counter", "counter"), n("within", "counter")]],
	["setlength", [n("length", "length"), n("value", "dimension")]],
	["addtolength", [n("length", "length"), n("value", "dimension")]],
	["settowidth", [n("length", "length"), n("text", "free-text")]],
	["settoheight", [n("length", "length"), n("text", "free-text")]],
	["settodepth", [n("length", "length"), n("text", "free-text")]],
	["fontspec", [t("options", "key-value"), n("font", "font-family")]],
	["fontfamily", [n("font", "font-family")]],
	["setkeys", [n("family", "key-family"), n("options", "key-value", {
		keyFamilySelectorArgumentIndex: 0,
		list: !0
	})]],
	["SetKeys", [t("family", "key-family"), n("options", "key-value", {
		keyFamilySelectorArgumentIndex: 0,
		list: !0
	})]],
	["pgfkeys", [n("options", "key-value", {
		keyFamily: "pgfkeys",
		list: !0
	})]]
]);
function i(e) {
	let t = [], n = +!!e.startsWith("\\");
	for (; n < e.length && /[a-zA-Z@*]/.test(e[n]);) n++;
	for (; n < e.length;) {
		for (; n < e.length && /\s/.test(e[n]);) n++;
		let r = e[n];
		if (r !== "{" && r !== "[") break;
		let { content: i, end: s } = a(e, n);
		i.includes("$") && t.push({
			kind: r === "{" ? "required" : "optional",
			placeholder: o(i)
		}), n = s;
	}
	return t;
}
function a(e, t) {
	if (e[t] === "[") {
		let n = e.indexOf("]", t + 1), r = n < 0 ? e.length : n, i = n < 0 ? e.length : n + 1;
		return {
			content: e.slice(t + 1, r),
			end: i
		};
	}
	let n = 0;
	for (let r = t; r < e.length; r++) if (e[r] === "{") n++;
	else if (e[r] === "}" && --n === 0) return {
		content: e.slice(t + 1, r),
		end: r + 1
	};
	return {
		content: e.slice(t + 1),
		end: e.length
	};
}
function o(e) {
	let t = e.match(/\$\{\d+:([^}]*)\}/);
	return t ? t[1] : "";
}
var s = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Map();
function u(e, t) {
	for (let n of t) {
		if (!n || typeof n.name != "string" || s.has(n.name)) continue;
		let t = {
			args: n.args ?? [],
			package: e
		};
		n.doc && (t.doc = n.doc), s.set(n.name, t);
	}
}
function d(e) {
	u(e.package, Array.isArray(e.commands) ? e.commands : []);
	for (let t of Array.isArray(e.environments) ? e.environments : []) {
		if (!t || typeof t.name != "string" || (c.add(t.name), l.has(t.name))) continue;
		let n = {
			args: t.args ?? [],
			package: e.package
		};
		t.doc && (n.doc = t.doc), l.set(t.name, n);
	}
}
function f() {
	return c;
}
function p(t) {
	let n = r.get(t);
	if (n) return n;
	let a = e(t);
	return a ? i(a.snippet) : s.get(t)?.args;
}
function m(e) {
	return l.get(e)?.args;
}
function h(t) {
	let n = e(t);
	return n ? n.package : s.get(t)?.package;
}
function g(e, t) {
	return `\\${e}${t.map((e) => e.kind === "required" ? `{${e.placeholder ?? ""}}` : `[${e.placeholder ?? ""}]`).join("")}`;
}
//#endregion
export { g as formatSignature, h as getCommandPackage, p as getCommandSignature, m as getEnvironmentSignature, f as getShardEnvironments, i as parseSignature, d as registerShard };
