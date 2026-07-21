function r(i) {
  const e = /* @__PURE__ */ new Set(), s = /* @__PURE__ */ new Set();
  for (const t of i.split(/\r?\n/))
    t.startsWith("L:") ? e.add(t.slice(2).trim()) : t.startsWith("R:") && s.add(t.slice(2).trim());
  return { labels: e, refs: s };
}
export {
  r as parseTraceFile
};
