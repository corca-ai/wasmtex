import { resolveTexliveUrl as k } from "./base-worker-engine.js";
import { PRELOAD_FILES as h, KNOWN_404S as x } from "./texlive-manifest.js";
async function $(e) {
  const o = e?.texliveVersion ?? "2025", n = e?.concurrency ?? 6, t = e?.signal, d = e?.onProgress, c = k(e?.texliveUrl ?? null, o);
  P(c);
  const l = [], a = h.length;
  let i = 0;
  const s = [...h];
  async function w() {
    for (; s.length > 0; ) {
      if (t?.aborted) return;
      const r = s.shift();
      try {
        const p = `${c}pdftex/${r.format}/${r.filename}`, u = await fetch(p, t ? { signal: t } : {});
        if (u.ok) {
          const g = await u.arrayBuffer();
          l.push({ format: r.format, filename: r.filename, data: g });
        }
      } catch {
      }
      i++, d?.(i, a);
    }
  }
  const y = fetch(`${c}bloom-filter.bin`, t ? { signal: t } : {}).then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null), b = Array.from({ length: Math.min(n, a) }, () => w());
  await Promise.all(b);
  const f = await y;
  if (t?.aborted) throw new DOMException("Warmup aborted", "AbortError");
  const m = { files: l, notFound: [...x] };
  return f && (m.bloomFilter = f), m;
}
function P(e) {
  try {
    const o = new URL(e).origin;
    if (document.querySelector(`link[rel="preconnect"][href="${o}"]`)) return;
    const n = document.createElement("link");
    n.rel = "preconnect", n.href = o, document.head.appendChild(n);
  } catch {
  }
}
export {
  $ as warmup
};
