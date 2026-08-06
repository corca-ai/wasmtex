//#region src/lsp/file-completion.ts
var e = {
	"project-tex": /* @__PURE__ */ new Set(["tex"]),
	"project-bib": /* @__PURE__ */ new Set(["bib"]),
	"project-image": /* @__PURE__ */ new Set([
		"pdf",
		"png",
		"jpg",
		"jpeg",
		"eps",
		"svg",
		"webp"
	]),
	"project-listing": /* @__PURE__ */ new Set(/* @__PURE__ */ "tex.txt.md.c.h.cpp.py.js.ts.tsx.jsx.rs.go.java.kt.sh.bash.zsh.rb.php.swift.scala.sql.html.css.xml.json.yaml.yml.toml.ini.conf.m.mm.r.lua.pl.hs".split(".")),
	"project-data": /* @__PURE__ */ new Set([
		"csv",
		"tsv",
		"dat",
		"txt",
		"json",
		"xml",
		"yaml",
		"yml"
	]),
	"project-file": null
};
function t(e) {
	let t = e.lastIndexOf(".");
	return t < 0 ? "" : e.slice(t + 1).toLowerCase();
}
function n(n, r) {
	let i = e[r];
	return i === null || i.has(t(n));
}
function r(e) {
	return e.split("/").slice(0, -1).filter(Boolean);
}
function i(e, t) {
	let n = r(e), i = t.split("/").filter(Boolean), a = 0;
	for (; a < n.length && a < i.length && n[a] === i[a];) a++;
	return [...Array.from({ length: n.length - a }, () => ".."), ...i.slice(a)].join("/");
}
function a(e, t, n) {
	if (n.startsWith("/")) {
		let t = `/${e}`;
		return t.startsWith(n) ? t : null;
	}
	let r = i(t, e);
	if (n.startsWith("./")) {
		let e = r.startsWith("../") ? r : `./${r}`;
		return e.startsWith(n) ? e : null;
	}
	return n.startsWith("../") ? r.startsWith(n) ? r : null : e.startsWith(n) ? e : r.startsWith(n) ? r : null;
}
function o(e, t, r, i) {
	let o = /* @__PURE__ */ new Set(), s = [];
	for (let c of i.listFiles().sort()) {
		if (!n(c, e)) continue;
		let i = a(c, r, t);
		i === null || o.has(i) || (o.add(i), s.push({
			label: i,
			kind: "file",
			insertText: i,
			detail: `Project file: ${c}`,
			sortText: `0_${i}`,
			replaceLength: t.length
		}));
	}
	return s;
}
//#endregion
export { o as completeProjectFiles };
