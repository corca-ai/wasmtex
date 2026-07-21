class a {
  marks = /* @__PURE__ */ new Map();
  timings = /* @__PURE__ */ new Map();
  listeners = [];
  /** Start a named span. */
  mark(e) {
    this.marks.set(e, performance.now());
  }
  /** End a named span and record its duration. Returns ms elapsed. */
  end(e) {
    const t = this.marks.get(e);
    if (t === void 0) return 0;
    const s = performance.now() - t;
    this.marks.delete(e), this.timings.set(e, s);
    const r = { name: e, ms: s };
    for (const o of [...this.listeners]) o(r);
    return s;
  }
  /** Get last recorded duration for a span. */
  get(e) {
    return this.timings.get(e);
  }
  /** Get all recorded timings. */
  all() {
    return new Map(this.timings);
  }
  /** Subscribe to span completions. Returns an unsubscribe function (like
   *  {@link VirtualFS.onChange}) so a re-initialized overlay or embed doesn't leak a
   *  growing list of stale listeners. */
  onSpan(e) {
    return this.listeners.push(e), () => {
      const t = this.listeners.indexOf(e);
      t !== -1 && this.listeners.splice(t, 1);
    };
  }
}
const i = new a();
function p() {
  if (typeof window > "u" || !new URLSearchParams(window.location.search).has("perf") || document.getElementById("perf-overlay")) return;
  const n = document.createElement("div");
  n.id = "perf-overlay", n.style.cssText = [
    "position:fixed",
    "bottom:4px",
    "right:4px",
    "background:rgba(0,0,0,0.8)",
    "color:#0f0",
    "font:11px/1.4 monospace",
    "padding:6px 10px",
    "border-radius:4px",
    "z-index:9999",
    "pointer-events:none",
    "white-space:pre"
  ].join(";"), document.body.appendChild(n);
  const e = ["debounce", "compile", "synctex-parse", "render", "total"], t = i.onSpan(() => {
    const s = [];
    for (const r of e) {
      const o = i.get(r);
      o !== void 0 && s.push(`${r.padEnd(14)} ${o.toFixed(1).padStart(7)}ms`);
    }
    n.textContent = s.join(`
`);
  });
  return () => {
    t(), n.remove();
  };
}
export {
  a as PerfMetrics,
  p as initPerfOverlay,
  i as perf
};
