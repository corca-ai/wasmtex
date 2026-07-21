import { chooseBoundary as f, findPageBreaks as p, splitAtBoundary as d, firstDifference as k, includePositions as o, hashString as u } from "./checkpoint-boundaries.js";
import { splicePdfs as x, pdfPageCount as C } from "./pdf-splice.js";
import { extractPreamble as r } from "./preamble-utils.js";
const m = /\\(?:label|ref|pageref|eqref|autoref|cref|Cref|nameref|cite|bibitem|caption|footnote|appendix|(?:set|step|add(?:to)?)counter|newtheorem|(?:sub)*section|chapter|part|item|index|makeindex|printindex)(?![A-Za-z@])|\\begin\{(?:enumerate|equation|figure|table|align)/;
function S(l, t, e) {
  let n = l.length - 1, i = t.length - 1, a = 0;
  for (; n >= e && i >= e && l.charCodeAt(n) === t.charCodeAt(i); )
    n--, i--, a++;
  return a;
}
function P(l) {
  let t = 0;
  for (let e = 0; e < l.length; e++) l.charCodeAt(e) === 10 && t++;
  return t;
}
function g(l) {
  return l >= "a" && l <= "z" || l >= "A" && l <= "Z" || l === "*";
}
function F(l, t) {
  const e = k(l, t);
  if (e === l.length && e === t.length) return !1;
  const n = S(l, t, e);
  let i = e;
  for (; i > 0 && g(l[i - 1]); ) i--;
  i > 0 && l[i - 1] === "\\" && i--;
  let a = 0;
  const s = t.length - n;
  for (; s + a < t.length && g(t[s + a]); ) a++;
  const c = t.slice(i, s + a), h = l.slice(i, l.length - n + a);
  return m.test(c) || m.test(h);
}
class T {
  engine;
  maxCheckpoints;
  minHeadBytes;
  mainFile;
  /** Last fully-compiled project files (path → content), including the main file. */
  last = null;
  /** Main source at the last FULL compile (distinct from `last`, which advances on fast paints
   *  too). The head-unchanged test for the SyncTeX merge diffs against this. (#99 P2) */
  lastFullSource = null;
  checkpoints = /* @__PURE__ */ new Map();
  lru = [];
  constructor(t, e = {}) {
    this.engine = t, this.maxCheckpoints = e.maxCheckpoints ?? 4, this.minHeadBytes = e.minHeadBytes ?? 2e3, this.mainFile = e.mainFile ?? "main.tex";
  }
  /** Forget all incremental state (call when the document/engine is swapped). */
  reset() {
    this.last = null, this.lastFullSource = null, this.checkpoints.clear(), this.lru.length = 0;
  }
  /** Re-point the compiler at a new main file (and reset state). Without this the old
   *  main-file name stays wired into snapshot()/editOffset()/changeTouchesLabels(),
   *  corrupting the diff baseline after the host switches the active main file. */
  setMainFile(t) {
    this.mainFile = t, this.reset();
  }
  /** Standalone convenience: fast path if possible, else a raw full compile. Hosts
   *  that own a richer compile pipeline (bibtex/rerun) should instead call
   *  {@link tryIncremental} and {@link noteFull}. */
  async compile(t, e = /* @__PURE__ */ new Map()) {
    await this.syncProjectFiles(t, e);
    const n = await this.tryIncremental(t, e);
    return n || this.full(t, e);
  }
  async syncProjectFiles(t, e) {
    for (const [n, i] of e)
      n !== this.mainFile && await this.engine.writeFile(n, i);
    await this.engine.writeFile(this.mainFile, t);
  }
  /**
   * Record that the host performed a full compile (updating `main.aux`), so the next
   * edit diffs against it. Drops cached checkpoints when the preamble changed.
   */
  noteFull(t, e = /* @__PURE__ */ new Map()) {
    const n = this.last?.get(this.mainFile);
    n != null && r(n)?.preamble !== r(t)?.preamble && (this.checkpoints.clear(), this.lru.length = 0), this.last = this.snapshot(t, e), this.lastFullSource = t;
  }
  /** Cheap pre-flight for a servable tail edit: the head/tail split at the boundary before
   *  the edit, or null when a full compile is required (no baseline, preamble changed, no
   *  page break before the edit, or too-small head). No compile — pure string work. Shared
   *  by {@link tryIncremental} and {@link canFastServe}. Head size measures EFFECTIVE content:
   *  with \include the main-source prefix is tiny but the included chapters are the real head,
   *  so their bytes count too. */
  planFast(t, e) {
    const n = this.last?.get(this.mainFile);
    if (n == null || r(n)?.preamble !== r(t)?.preamble) return null;
    const i = f(
      p(t),
      this.editOffset(n, t, e)
    );
    if (i === null) return null;
    const { headText: a, tailText: s } = d(t, i);
    return this.headSize(a, e) < this.minHeadBytes ? null : { prevMain: n, headText: a, tailText: s };
  }
  /** Attempt the checkpoint fast path; return null to signal "fall back to full". */
  async tryIncremental(t, e = /* @__PURE__ */ new Map()) {
    const n = this.planFast(t, e);
    if (n === null) return null;
    try {
      const { checkpoint: i, built: a } = await this.ensureCheckpoint(n.headText, e), s = await this.engine.compileFromCheckpoint(i.fmt, n.tailText);
      if (!s.pdf || s.status !== 0 && s.status !== 1) return null;
      const c = await x([i.headPdf, s.pdf]), h = !this.changeTouchesLabels(n.prevMain, t, e), y = await C(i.headPdf), w = P(n.headText), b = this.lastFullSource != null && this.lastFullSource.slice(0, n.headText.length) === n.headText;
      return this.last = this.snapshot(t, e), {
        pdf: c,
        log: s.log,
        success: !0,
        incremental: !0,
        checkpointBuilt: a,
        final: h,
        tailSynctex: s.synctex,
        headPageCount: y,
        tailLineOffset: w,
        headUnchangedSinceFull: b
      };
    } catch {
      return null;
    }
  }
  /** True iff a fast, `final` incremental paint is servable for this edit — the cheap
   *  pre-flight ({@link planFast}) succeeds AND the change touches no labels/numbering. Lets
   *  an interactive host skip the tail compile entirely for edits that must go full (preamble,
   *  pre-first-page-break, or label/citation edits), so those never pay a wasted tail compile
   *  on the way to the full one. (#99) */
  canFastServe(t, e = /* @__PURE__ */ new Map()) {
    const n = this.planFast(t, e);
    return n !== null && !this.changeTouchesLabels(n.prevMain, t, e);
  }
  /**
   * Speculatively build (and cache) the checkpoint for the boundary before `editOffset`
   * (default: end of document) so a subsequent tail edit there is served from cache
   * instead of paying the ~one-full-compile build cost on the first edit (#99, option A).
   *
   * Returns `true` iff it built a new checkpoint; `false` when there's no baseline yet
   * (a full compile must have seeded `main.aux` first), the preamble differs from the
   * baseline, no page-break boundary qualifies, the head is too small, or the checkpoint
   * is already cached (already-warm → nothing to do).
   *
   * The caller MUST ensure the engine is idle: `buildCheckpoint` drives the worker, and
   * unlike `compile()` it does not flip the engine's ready status, so overlapping it with
   * a compile is the caller's responsibility to serialize.
   */
  async prebuild(t, e = /* @__PURE__ */ new Map(), n = t.length) {
    const i = this.last?.get(this.mainFile);
    if (i == null || r(i)?.preamble !== r(t)?.preamble) return !1;
    const a = f(p(t), n);
    if (a === null) return !1;
    const { headText: s } = d(t, a);
    if (this.headSize(s, e) < this.minHeadBytes) return !1;
    if (this.checkpoints.has(this.checkpointKey(s, e)))
      return this.touch(this.checkpointKey(s, e)), !1;
    try {
      const { built: c } = await this.ensureCheckpoint(s, e);
      return c;
    } catch {
      return !1;
    }
  }
  /** First changed position in the main source, pulled earlier to the `\include`/`\input`
   *  command of any included file whose content changed since the last full compile. */
  editOffset(t, e, n) {
    let i = k(t, e);
    if (n.size && this.last) {
      const a = o(e);
      for (const [s, c] of n) {
        if (s === this.mainFile) continue;
        const h = this.includePosFor(s, a);
        h !== void 0 && h < i && this.last.get(s) !== c && (i = h);
      }
    }
    return i;
  }
  /** The `\include`/`\input` offset that loads `path`. Matches the include name exactly
   *  (`ch1.tex` ↔ `\include{ch1}`), else by bare basename so a subdirectory chapter loaded
   *  via TeX's search path (`\input{intro}` ↔ `chapters/intro.tex`) is still found. */
  includePosFor(t, e) {
    const n = t.replace(/\.tex$/, ""), i = e.get(n);
    return i !== void 0 ? i : e.get(n.slice(n.lastIndexOf("/") + 1));
  }
  /** Content of the file an include name refers to: the exact `${n}.tex`/`n` key, else a
   *  unique basename match (so `\input{intro}` resolves `chapters/intro.tex`). '' if none
   *  or ambiguous (two files sharing a basename → don't guess). */
  includedContent(t, e) {
    const n = e.get(`${t}.tex`) ?? e.get(t);
    if (n !== void 0) return n;
    const i = t.slice(t.lastIndexOf("/") + 1);
    let a;
    for (const [s, c] of e)
      if (s !== this.mainFile && s.slice(s.lastIndexOf("/") + 1).replace(/\.tex$/, "") === i) {
        if (a !== void 0) return "";
        a = c;
      }
    return a ?? "";
  }
  /** True if the main edit OR any changed included file touched labels/numbering. */
  changeTouchesLabels(t, e, n) {
    if (F(t, e)) return !0;
    if (!this.last) return !1;
    const i = /* @__PURE__ */ new Set([...this.last.keys(), ...n.keys()]);
    i.delete(this.mainFile);
    for (const a of i) {
      const s = this.last.get(a) ?? "", c = n.get(a) ?? "";
      if (s !== c && F(s, c)) return !0;
    }
    return !1;
  }
  async ensureCheckpoint(t, e) {
    const n = this.checkpointKey(t, e), i = this.checkpoints.get(n);
    if (i)
      return this.touch(n), { checkpoint: i, built: !1 };
    const { fmt: a, headPdf: s } = await this.engine.buildCheckpoint(t);
    if (!s) throw new Error("checkpoint produced no head PDF");
    const c = { key: n, fmt: a, headPdf: s };
    return this.checkpoints.set(n, c), this.touch(n), this.evict(), { checkpoint: c, built: !0 };
  }
  /** Effective head content size: the main-source prefix plus the bytes of the files it
   *  includes (so an \include-only main file isn't mistaken for a tiny head). */
  headSize(t, e) {
    let n = t.length;
    for (const i of o(t).keys())
      n += this.includedContent(i, e).length;
    return n;
  }
  /** Key a checkpoint by its head text AND the content of the files the head can bake in —
   *  so an early-chapter or head-asset edit invalidates exactly the checkpoints after it.
   *  Folds in: (1) `\include`/`\input`/`\subfile` targets the head loads (basename-aware),
   *  and (2) every non-.tex project file (images/data the head may `\includegraphics`), which
   *  an include-name lookup can't see — without (2) a changed head asset reuses a stale head. */
  checkpointKey(t, e) {
    const i = [...o(t).keys()].sort().map((s) => `${s}=${u(this.includedContent(s, e))}`), a = [];
    for (const [s, c] of e)
      s === this.mainFile || s.endsWith(".tex") || a.push(`${s}=${u(c)}`);
    return a.sort(), `${t.length}:${u(t)}|${i.join(",")}|${a.join(",")}`;
  }
  snapshot(t, e) {
    const n = new Map(e);
    return n.set(this.mainFile, t), n;
  }
  touch(t) {
    const e = this.lru.indexOf(t);
    e !== -1 && this.lru.splice(e, 1), this.lru.push(t);
  }
  evict() {
    for (; this.lru.length > this.maxCheckpoints; ) {
      const t = this.lru.shift();
      t && this.checkpoints.delete(t);
    }
  }
  async full(t, e) {
    const n = await this.engine.compile();
    return this.last = this.snapshot(t, e), {
      pdf: n.pdf,
      log: n.log,
      success: n.success,
      incremental: !1,
      checkpointBuilt: !1,
      final: !0,
      reason: "no usable checkpoint"
    };
  }
}
export {
  T as IncrementalCompiler,
  F as editTouchesLabels
};
