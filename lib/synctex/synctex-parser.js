const P = 0.9962640099626402;
function y(c, e, t) {
  return c * e * t / (1e3 * 65536) * P;
}
async function W(c) {
  if (c.length >= 2 && c[0] === 31 && c[1] === 139) {
    if (typeof DecompressionStream > "u")
      throw new Error("DecompressionStream not available — cannot decompress synctex.gz");
    const e = new DecompressionStream("gzip"), t = e.writable.getWriter(), n = e.readable.getReader();
    t.write(c).then(() => t.close()).catch(() => {
    });
    const i = [];
    for (; ; ) {
      const { done: l, value: f } = await n.read();
      if (l) break;
      i.push(f);
    }
    const o = i.reduce((l, f) => l + f.length, 0), s = new Uint8Array(o);
    let r = 0;
    for (const l of i)
      s.set(l, r), r += l.length;
    return s;
  }
  return c;
}
function T(c) {
  const e = c.indexOf(":");
  if (e === -1) return [0, 0, 0, ""];
  const t = c.slice(0, e), n = c.slice(e + 1), i = t.split(","), o = parseInt(i[0] ?? "0", 10), s = parseInt(i[1] ?? "0", 10), r = i.length > 2 ? parseInt(i[2] ?? "0", 10) : 0;
  return [o, s, r, n];
}
function R(c) {
  const e = c.indexOf(":");
  let t, n;
  e === -1 ? (t = c, n = null) : (t = c.slice(0, e), n = c.slice(e + 1));
  const i = t.split(","), o = parseInt(i[0] ?? "0", 10), s = parseInt(i[1] ?? "0", 10);
  if (!n) return [o, s, 0, 0, 0];
  const r = n.split(","), l = parseInt(r[0] ?? "0", 10), f = parseInt(r[1] ?? "0", 10), h = parseInt(r[2] ?? "0", 10);
  return [o, s, l, f, h];
}
function k(c) {
  return c.type === "hbox" || c.type === "vbox" || c.type === "void_hbox" || c.type === "void_vbox";
}
const S = {
  "[": "vbox",
  "(": "hbox",
  v: "void_vbox",
  h: "void_hbox",
  x: "kern",
  k: "kern",
  g: "glue",
  $: "math"
};
function O(c, e) {
  if (e.type === "hbox" || e.type === "vbox" || e.type === "void_hbox" || e.type === "void_vbox") {
    const t = e.h, n = t + e.width;
    return c < t ? t - c : c > n ? n - c : 0;
  }
  if (e.type === "kern") {
    const t = e.width;
    let n, i;
    t > 0 ? (n = e.h - t, i = e.h) : (n = e.h, i = e.h - t);
    const o = (n + i) / 2;
    return c < n ? n - c + 0.01 : c > i ? i - c - 0.01 : c > o ? i - c + 0.01 : n - c - 0.01;
  }
  return e.h - c;
}
function d(c, e, t) {
  let n, i, o, s;
  if (t.type === "hbox" || t.type === "vbox")
    n = t.h, i = n + t.width, o = t.v - t.height, s = t.v + t.depth;
  else if (t.type === "void_hbox" || t.type === "void_vbox") {
    const r = w(c, e, t.h, t.h, t.v - t.height, t.v + t.depth), l = w(
      c,
      e,
      t.h + t.width,
      t.h + t.width,
      t.v - t.height,
      t.v + t.depth
    );
    return Math.min(r, l);
  } else if (t.type === "kern") {
    const r = t.parent ? t.parent.height : 0, l = w(c, e, t.h, t.h, t.v - r, t.v), f = w(c, e, t.h - t.width, t.h - t.width, t.v - r, t.v);
    return Math.min(l, f);
  } else {
    const r = t.parent ? t.parent.height : 0;
    return n = t.h, i = t.h, s = t.v, o = s - r, w(c, e, n, i, o, s);
  }
  return w(c, e, n, i, o, s);
}
function w(c, e, t, n, i, o) {
  let s = 0, r = 0;
  return c < t ? s = t - c : c > n && (s = c - n), e < i ? r = i - e : e > o && (r = e - o), s + r;
}
function A(c) {
  let e = c;
  return e.startsWith("/work/./") ? e = e.slice(8) : e.startsWith("/work/") ? e = e.slice(6) : e.startsWith("./") && (e = e.slice(2)), e.replace(/\/\.\//g, "/");
}
class H {
  /**
   * Parse raw synctex data (possibly gzip-compressed) into structured data.
   */
  async parse(e) {
    const t = await W(e), n = new TextDecoder().decode(t);
    return this.parseText(n);
  }
  /**
   * Parse synctex text content into a tree-structured representation.
   * Uses a stack to track open vbox/hbox containers, building parent-child
   * relationships and a friend index for O(1) forward lookup.
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: stack-based tree parser with preamble handling
  parseText(e) {
    const t = /* @__PURE__ */ new Map(), n = /* @__PURE__ */ new Map(), i = {
      inputs: /* @__PURE__ */ new Map(),
      pages: /* @__PURE__ */ new Map(),
      pageRoots: t,
      friendIndex: n,
      magnification: 1e3,
      unit: 1,
      xOffset: 0,
      yOffset: 0
    }, o = (h) => {
      const u = h.indexOf(":"), a = h.indexOf(":", u + 1);
      if (a !== -1) {
        const g = parseInt(h.slice(u + 1, a), 10);
        i.inputs.set(g, A(h.slice(a + 1)));
      }
    }, s = e.split(/\r?\n/);
    let r = 0, l = !1;
    const f = [];
    for (const h of s) {
      if (!h) continue;
      if (h.startsWith("Input:")) {
        o(h);
        continue;
      }
      if (!l) {
        if (h === "Content:") {
          l = !0;
          continue;
        }
        if (h.startsWith("Magnification:")) {
          const p = parseInt(h.slice(14), 10);
          Number.isFinite(p) && p > 0 && (i.magnification = p);
        } else if (h.startsWith("Unit:")) {
          const p = parseInt(h.slice(5), 10);
          Number.isFinite(p) && p > 0 && (i.unit = p);
        } else if (h.startsWith("X Offset:")) {
          const p = parseInt(h.slice(9), 10);
          Number.isFinite(p) && (i.xOffset = p);
        } else if (h.startsWith("Y Offset:")) {
          const p = parseInt(h.slice(9), 10);
          Number.isFinite(p) && (i.yOffset = p);
        }
        continue;
      }
      if (h.startsWith("Postamble:")) break;
      const u = h[0];
      if (u === "{") {
        r = parseInt(h.slice(1), 10), i.pages.has(r) || (i.pages.set(r, []), t.set(r, [])), f.length = 0;
        continue;
      }
      if (u === "}") {
        f.length = 0;
        continue;
      }
      if (u === "]" || u === ")") {
        f.length > 0 && f.pop();
        continue;
      }
      if (u === "!") continue;
      const a = S[u];
      if (!a || r === 0) continue;
      const g = h.slice(1), [b, v, N, C] = T(g);
      if (!C && v === 0) continue;
      const [_, B, F, L, M] = R(C), I = i.unit, x = i.magnification, m = {
        type: a,
        input: b,
        line: v,
        column: N,
        page: r,
        h: y(_ + i.xOffset, I, x),
        v: y(B + i.yOffset, I, x),
        // Kern widths are signed (a negative kern moves left); the geometry
        // consumers (hOrderedDistance/pointNodeDistance) handle the sign, so we must
        // NOT abs() it away here. Box widths are ≥0, so this stays a no-op for them.
        width: y(F, I, x),
        height: y(Math.abs(L), I, x),
        depth: y(Math.abs(M), I, x),
        parent: null,
        children: []
      };
      if (f.length > 0) {
        const p = f[f.length - 1];
        m.parent = p, p.children.push(m);
      } else
        t.get(r).push(m);
      if ((u === "[" || u === "(") && f.push(m), i.pages.get(r).push(m), v > 0) {
        const p = `${b}:${v}`;
        let D = n.get(p);
        D || (D = [], n.set(p, D)), D.push(m);
      }
    }
    return i;
  }
  /**
   * Inverse search: PDF click → source location.
   * Port of synctex_iterator_new_edit from reference.
   *
   * Algorithm:
   * 1. Scan all hboxes on the page, find smallest containing one
   * 2. Drill into deepest container (DFS)
   * 3. Find L/R closest children using horizontal ordered distance
   * 4. Pick the best based on line number and distance
   * 5. Fallback: closest deep child using L1 distance
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: faithful port of reference algorithm
  inverseLookup(e, t, n, i) {
    const o = e.pages.get(t);
    if (!o || o.length === 0) return null;
    let s = null;
    for (const u of o)
      u.type === "hbox" && this.pointInBox(n, i, u) && (s = s ? this.smallestContainer(u, s) : u);
    if (!s) {
      let u = 1 / 0;
      for (const a of o) {
        if (a.type !== "hbox") continue;
        const g = d(n, i, a);
        g < u && (u = g, s = a);
      }
    }
    if (s) {
      s = this.deepestContainer(n, i, s);
      const { l: u, r: a } = this.getClosestChildrenInBox(n, i, s), g = this.pickBestLR(u, a, n, i);
      if (g && g.line > 0)
        return { file: e.inputs.get(g.input) ?? "", line: g.line };
      if (s.line > 0)
        return { file: e.inputs.get(s.input) ?? "", line: s.line };
    }
    const r = e.pageRoots?.get(t);
    if (r && r.length > 0) {
      let u = null, a = 1 / 0;
      for (const g of r) {
        const b = this.closestDeepChild(n, i, g);
        if (!b || b.line === 0) continue;
        const v = d(n, i, b);
        v < a && (a = v, u = b);
      }
      if (u)
        return { file: e.inputs.get(u.input) ?? "", line: u.line };
    }
    let l = null, f = 1 / 0;
    for (const u of o) {
      if (u.line === 0) continue;
      const a = d(n, i, u);
      a < f && (f = a, l = u);
    }
    return l ? { file: e.inputs.get(l.input) ?? "", line: l.line } : null;
  }
  /**
   * Forward search: source line → PDF region.
   * Port of synctex_iterator_new_display from reference.
   *
   * Algorithm:
   * 1. Find input tag for the file
   * 2. Try exact line match via friend index
   * 3. If no match, zigzag to nearby lines: line±1, ±2, ... up to 100 tries
   * 4. For each line: non-box nodes first (reference: exclude_box=YES),
   *    then include boxes as fallback
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: nearest-line zigzag with two-pass search
  forwardLookup(e, t, n) {
    let i = -1;
    for (const [l, f] of e.inputs)
      if (f === t) {
        i = l;
        break;
      }
    if (i === -1) {
      for (const [l, f] of e.inputs)
        if (f.endsWith(`/${t}`)) {
          i = l;
          break;
        }
    }
    if (i === -1) return null;
    const o = 3;
    let s = n, r = 1;
    for (let l = 0; l < 100 && !(Math.abs(s - n) > o); l++) {
      if (s > 0) {
        const f = this.forwardForLine(e, i, s);
        if (f) return f;
      }
      s += r, r = r < 0 ? -(r - 1) : -(r + 1), s <= 0 && (s += r, r = r < 0 ? -(r - 1) : -(r + 1));
    }
    return null;
  }
  /** Forward search for a specific line. Two-pass: non-box first, then all. */
  forwardForLine(e, t, n) {
    const i = e.friendIndex?.get(`${t}:${n}`);
    if (!i || i.length === 0) return null;
    const o = i.filter((f) => f.width > 0 || !k(f));
    if (o.length === 0) return null;
    const s = o.reduce((f, h) => h.page < f ? h.page : f, 1 / 0), r = o.filter((f) => f.page === s), l = r.filter((f) => !k(f));
    if (l.length > 0) {
      const f = this.forwardFromNodes(l);
      if (f) return f;
    }
    return this.forwardFromNodes(r);
  }
  /** Compute forward search result from matched nodes */
  forwardFromNodes(e) {
    const t = e[0].page, n = e.filter((s) => s.page === t);
    if (n.length === 0) return null;
    const i = /* @__PURE__ */ new Set(), o = [];
    for (const s of n)
      if (s.type === "hbox" || s.type === "void_hbox")
        o.push(s);
      else if (!(s.type === "vbox" || s.type === "void_vbox")) {
        const r = this.findAncestorHbox(s);
        r && i.add(r);
      }
    return i.size > 0 ? this.bboxFromNodes([...i], t) : o.length > 0 ? this.bboxFromNodes(o, t) : this.bboxFromNodes(n, t);
  }
  /** Point-in-box test (reference: _synctex_point_in_box_v2) */
  pointInBox(e, t, n) {
    return O(e, n) === 0 && this.vOrderedDistance(t, n) === 0;
  }
  /** Vertical ordered distance (reference: _synctex_point_v_ordered_distance_v2) */
  vOrderedDistance(e, t) {
    let n, i;
    if (t.type === "hbox")
      n = t.v - t.height, i = t.v + t.depth;
    else if (t.type === "vbox" || t.type === "void_vbox" || t.type === "void_hbox")
      n = t.v - t.height, i = t.v + t.depth;
    else {
      const o = t.parent;
      if (o)
        n = t.v - o.height, i = t.v + o.depth;
      else
        return t.v - e;
    }
    return e < n ? n - e : e > i ? i - e : 0;
  }
  /** Smallest container by area (reference: _synctex_smallest_container_v2) */
  smallestContainer(e, t) {
    const n = e.width * (e.height + e.depth), i = t.width * (t.height + t.depth);
    return n < i ? e : n > i ? t : e.height + e.depth < t.height + t.depth ? e : t;
  }
  /**
   * Deepest container: DFS to find the deepest box containing the hit point.
   * Reference: _synctex_eq_deepest_container_v2
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: faithful port of reference C algorithm
  deepestContainer(e, t, n) {
    if (n.children.length === 0) return n;
    for (const i of n.children)
      if (this.pointInBox(e, t, i))
        return this.deepestContainer(e, t, i);
    if (n.type === "vbox") {
      let i = null, o = 1 / 0;
      for (const s of n.children)
        if (s.children.length > 0) {
          const r = d(e, t, s);
          r < o && (o = r, i = s);
        }
      if (i) return this.deepestContainer(e, t, i);
    }
    return n;
  }
  /**
   * Find L/R closest children within a box using horizontal ordered distance.
   * Reference: __synctex_eq_get_closest_children_in_hbox_v2
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: L/R bracketing from reference
  getClosestChildrenInBox(e, t, n) {
    let i = null, o = 1 / 0, s = null, r = 1 / 0;
    for (const l of n.children) {
      const f = O(e, l);
      if (f > 0)
        (f < r || f === r && s && l.line < s.line) && (s = l, r = f);
      else if (f === 0) {
        if (l.children.length > 0)
          return this.getClosestChildrenInBox(e, t, l);
        i = l, o = 0;
      } else {
        const h = -f;
        (h < o || h === o && i && l.line < i.line) && (i = l, o = h);
      }
    }
    if (i && i.children.length > 0) {
      const l = this.closestDeepChild(e, t, i);
      l && (i = l);
    }
    if (s && s.children.length > 0) {
      const l = this.closestDeepChild(e, t, s);
      l && (s = l);
    }
    return { l: i, r: s };
  }
  /**
   * Pick the best of L/R results.
   * Reference: synctex_iterator_new_edit lines 7338-7377
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: faithful port of reference C algorithm
  pickBestLR(e, t, n, i) {
    if (e && t) {
      if (e.line <= 0 && t.line > 0) return t;
      if (t.line <= 0 && e.line > 0) return e;
      if (e.input !== t.input || e.line !== t.line) {
        if (t.line < e.line) return t;
        if (e.line < t.line) return e;
        const r = d(n, i, e), l = d(n, i, t);
        return r <= l ? e : t;
      }
      const o = d(n, i, e), s = d(n, i, t);
      return o <= s ? e : t;
    }
    return e ?? t;
  }
  /**
   * Recursive closest deep child by L1 distance.
   * Reference: __synctex_closest_deep_child_v2
   */
  closestDeepChild(e, t, n) {
    if (n.children.length === 0) return null;
    let i = null, o = 1 / 0;
    for (const s of n.children) {
      let r, l;
      if (s.children.length > 0) {
        const f = this.closestDeepChild(e, t, s);
        f ? (r = f, l = d(e, t, f)) : (r = s, l = d(e, t, s));
      } else
        r = s, l = d(e, t, s);
      (l < o || l === o && r.type !== "kern" && i?.type === "kern") && (i = r, o = l);
    }
    return i;
  }
  /** Walk up from a leaf to find the nearest ancestor hbox */
  findAncestorHbox(e) {
    let t = e.parent;
    for (; t; ) {
      if (t.type === "hbox") return t;
      t = t.parent;
    }
    return null;
  }
  /** Compute a bounding box enclosing the given nodes */
  bboxFromNodes(e, t) {
    let n = 1 / 0, i = -1 / 0, o = 1 / 0, s = -1 / 0;
    for (const r of e) {
      const l = r.v - r.height, f = r.v + r.depth;
      r.h < n && (n = r.h), r.h + r.width > i && (i = r.h + r.width), l < o && (o = l), f > s && (s = f);
    }
    return s - o < 2 && (o = e[0].v - 12, s = e[0].v + 3), {
      page: t,
      x: n,
      y: o,
      width: Math.max(i - n, 10),
      height: Math.max(s - o, 10)
    };
  }
}
export {
  H as SynctexParser,
  A as normalizeSynctexInputName
};
