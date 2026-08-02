const c = {
  "project-tex": /* @__PURE__ */ new Set(["tex"]),
  "project-bib": /* @__PURE__ */ new Set(["bib"]),
  "project-image": /* @__PURE__ */ new Set(["pdf", "png", "jpg", "jpeg", "eps", "svg", "webp"]),
  "project-listing": /* @__PURE__ */ new Set([
    "tex",
    "txt",
    "md",
    "c",
    "h",
    "cpp",
    "py",
    "js",
    "ts",
    "tsx",
    "jsx",
    "rs",
    "go",
    "java",
    "kt",
    "sh",
    "bash",
    "zsh",
    "rb",
    "php",
    "swift",
    "scala",
    "sql",
    "html",
    "css",
    "xml",
    "json",
    "yaml",
    "yml",
    "toml",
    "ini",
    "conf",
    "m",
    "mm",
    "r",
    "lua",
    "pl",
    "hs"
  ]),
  "project-data": /* @__PURE__ */ new Set(["csv", "tsv", "dat", "txt", "json", "xml", "yaml", "yml"]),
  "project-file": null
};
function a(n) {
  const l = n.lastIndexOf(".");
  return l < 0 ? "" : n.slice(l + 1).toLowerCase();
}
function u(n, l) {
  const t = c[l];
  return t === null || t.has(a(n));
}
function h(n) {
  return n.split("/").slice(0, -1).filter(Boolean);
}
function m(n, l) {
  const t = h(n), s = l.split("/").filter(Boolean);
  let e = 0;
  for (; e < t.length && e < s.length && t[e] === s[e]; ) e++;
  return [...Array.from({ length: t.length - e }, () => ".."), ...s.slice(e)].join(
    "/"
  );
}
function f(n, l, t) {
  if (t.startsWith("/")) {
    const e = `/${n}`;
    return e.startsWith(t) ? e : null;
  }
  const s = m(l, n);
  if (t.startsWith("./")) {
    const e = s.startsWith("../") ? s : `./${s}`;
    return e.startsWith(t) ? e : null;
  }
  return t.startsWith("../") ? s.startsWith(t) ? s : null : n.startsWith(t) ? n : s.startsWith(t) ? s : null;
}
function j(n, l, t, s) {
  const e = /* @__PURE__ */ new Set(), r = [];
  for (const i of s.listFiles().sort()) {
    if (!u(i, n)) continue;
    const o = f(i, t, l);
    o === null || e.has(o) || (e.add(o), r.push({
      label: o,
      kind: "file",
      insertText: o,
      detail: `Project file: ${i}`,
      sortText: `0_${o}`,
      replaceLength: l.length
    }));
  }
  return r;
}
export {
  j as completeProjectFiles
};
