import { mergeTailSynctex as k } from "../synctex/synctex-merge.js";
import { SynctexParser as S } from "../synctex/synctex-parser.js";
import { chooseBoundary as f, findPageBreaks as p, splitAtBoundary as d, includePositions as o, firstDifference as x, hashString as u } from "./checkpoint-boundaries.js";
import { splicePdfs as b, pdfPageCount as C } from "./pdf-splice.js";
import { extractPreamble as h } from "./preamble-utils.js";
const m = /\\(?:label|ref|pageref|eqref|autoref|cref|Cref|nameref|cite|bibitem|caption|footnote|appendix|(?:set|step|add(?:to)?)counter|newtheorem|(?:sub)*section|chapter|part|item|index|makeindex|printindex)(?![A-Za-z@])|\\begin\{(?:enumerate|equation|figure|table|align)/, y = /\\(?:tableofcontents|listof[a-z]+|bibliography(?![A-Za-z])|printbibliography|printindex|printglossary|printglossaries|printnomenclature)/i;
function P(a, t, e) {
  let n = a.length - 1, i = t.length - 1, l = 0;
  for (; n >= e && i >= e && a.charCodeAt(n) === t.charCodeAt(i); )
    n--, i--, l++;
  return l;
}
function B(a) {
  let t = 0;
  for (let e = 0; e < a.length; e++) a.charCodeAt(e) === 10 && t++;
  return t;
}
function F(a) {
  return a >= "a" && a <= "z" || a >= "A" && a <= "Z" || a === "*";
}
function g(a, t) {
  const e = x(a, t);
  if (e === a.length && e === t.length) return !1;
  const n = P(a, t, e);
  let i = e;
  for (; i > 0 && F(a[i - 1]); ) i--;
  i > 0 && a[i - 1] === "\\" && i--;
  let l = 0;
  const s = t.length - n;
  for (; s + l < t.length && F(t[s + l]); ) l++;
  const r = t.slice(i, s + l), c = a.slice(i, a.length - n + l);
  return m.test(r) || m.test(c);
}
class z {
  engine;
  maxCheckpoints;
  minHeadBytes;
  mainFile;
  /** Last fully-compiled project files (path → content), including the main file. */
  last = null;
  /** Main source at the last FULL compile (distinct from `last`, which advances on fast paints
   *  too). The head-unchanged test for the SyncTeX merge diffs against this. (#99 P2) */
  lastFullSource = null;
  /** Project files at the last FULL compile — the head-unchanged test also compares the chapters
   *  the head `\include`s against these (a chapter changed since the last full but not since the
   *  last paint would leave the merge base stale). (#99 P2 multi-file) */
  lastFullFiles = null;
  /** Last full compile's SyncTeX — the head merge-base. Kept as raw bytes and parsed lazily
   *  (once per full compile, reused across the fast paints that follow) into `lastFullSynctex`. */
  lastFullSynctexBytes = null;
  lastFullSynctex = null;
  synctexParser = new S();
  checkpoints = /* @__PURE__ */ new Map();
  lru = [];
  constructor(t, e = {}) {
    this.engine = t, this.maxCheckpoints = e.maxCheckpoints ?? 4, this.minHeadBytes = e.minHeadBytes ?? 2e3, this.mainFile = e.mainFile ?? "main.tex";
  }
  /** Forget all incremental state (call when the document/engine is swapped). */
  reset() {
    this.last = null, this.lastFullSource = null, this.lastFullFiles = null, this.lastFullSynctexBytes = null, this.lastFullSynctex = null, this.checkpoints.clear(), this.lru.length = 0;
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
   * Record that the host performed a full compile (updating `main.aux`), so the next edit diffs
   * against it. Drops cached checkpoints when the preamble changed. Pass the full compile's raw
   * SyncTeX (`CompileResult.synctex`) so the next fast paint can splice its tail onto this head
   * and return exact {@link IncrementalResult.synctexData} (#99 P2) — omit it to skip splicing.
   */
  noteFull(t, e = /* @__PURE__ */ new Map(), n = null) {
    const i = this.last?.get(this.mainFile);
    i != null && h(i)?.preamble !== h(t)?.preamble && (this.checkpoints.clear(), this.lru.length = 0), this.last = this.snapshot(t, e), this.lastFullSource = t, this.lastFullFiles = this.snapshot(t, e), this.lastFullSynctexBytes = n, this.lastFullSynctex = null;
  }
  /** The last full compile's parsed SyncTeX (the head merge-base), parsed once and cached. */
  async ensureLastFullSynctex() {
    return this.lastFullSynctex ? this.lastFullSynctex : this.lastFullSynctexBytes ? (this.lastFullSynctex = await this.synctexParser.parse(this.lastFullSynctexBytes), this.lastFullSynctex) : null;
  }
  /** Cheap pre-flight for a servable tail edit: the head/tail split at the boundary before
   *  the edit, or null when a full compile is required (no baseline, preamble changed, no
   *  page break before the edit, or too-small head). No compile — pure string work. Shared
   *  by {@link tryIncremental} and {@link canFastServe}. Head size measures EFFECTIVE content:
   *  with \include the main-source prefix is tiny but the included chapters are the real head,
   *  so their bytes count too. */
  planFast(t, e) {
    const n = this.last?.get(this.mainFile);
    if (n == null || h(n)?.preamble !== h(t)?.preamble || y.test(t)) return null;
    const i = f(
      p(t),
      this.editOffset(n, t, e)
    );
    if (i === null) return null;
    const { headText: l, tailText: s } = d(t, i);
    return this.headSize(l, e) < this.minHeadBytes ? null : { prevMain: n, headText: l, tailText: s };
  }
  /** Attempt the checkpoint fast path; return null to signal "fall back to full". */
  async tryIncremental(t, e = /* @__PURE__ */ new Map()) {
    const n = this.planFast(t, e);
    if (n === null) return null;
    try {
      const { checkpoint: i, built: l } = await this.ensureCheckpoint(n.headText, e), s = await this.engine.compileFromCheckpoint(i.fmt, n.tailText);
      if (!s.pdf || s.status !== 0 && s.status !== 1) return null;
      const r = await b([i.headPdf, s.pdf]), c = !this.changeTouchesLabels(n.prevMain, t, e), w = await this.spliceTailSynctex(
        i,
        n.headText,
        s.synctex,
        e
      );
      return this.last = this.snapshot(t, e), {
        pdf: r,
        log: s.log,
        success: !0,
        incremental: !0,
        checkpointBuilt: l,
        final: c,
        synctexData: w
      };
    } catch {
      return null;
    }
  }
  /** Splice the tail's SyncTeX onto the last full compile's head → exact SyncTeX for the spliced
   *  PDF (#99 P2), or null when it can't run safely. Safe only when the ENTIRE head is unchanged
   *  since the last full compile — the main-source prefix AND every file it `\include`s — because
   *  a head file changed since the last full but not since the last paint renders fresh in the head
   *  PDF while the merge base still describes the old one. (`this.last` advances on fast paints, so
   *  the diff can't catch that; we compare against the last FULL snapshot.) */
  async spliceTailSynctex(t, e, n, i) {
    if (!n || this.lastFullSource == null || this.lastFullSource.slice(0, e.length) !== e) return null;
    const l = this.lastFullFiles ?? /* @__PURE__ */ new Map();
    for (const c of o(e).keys())
      if (this.includedContent(c, i) !== this.includedContent(c, l)) return null;
    const s = await this.ensureLastFullSynctex();
    if (!s) return null;
    const r = await this.synctexParser.parse(n);
    return k({
      head: s,
      tail: r,
      headPageCount: await C(t.headPdf),
      tailLineOffset: B(e),
      mainFile: this.mainFile,
      tailFile: "tail.tex"
    });
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
    if (i == null || h(i)?.preamble !== h(t)?.preamble || y.test(t)) return !1;
    const l = f(p(t), n);
    if (l === null) return !1;
    const { headText: s } = d(t, l);
    if (this.headSize(s, e) < this.minHeadBytes) return !1;
    const r = this.checkpointKey(s, e);
    if (this.checkpoints.has(r))
      return this.touch(r), !1;
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
    let i = x(t, e);
    if (n.size && this.last) {
      const l = o(e);
      for (const [s, r] of n) {
        if (s === this.mainFile) continue;
        const c = this.includePosFor(s, l);
        c !== void 0 && c < i && this.last.get(s) !== r && (i = c);
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
    let l;
    for (const [s, r] of e)
      if (s !== this.mainFile && s.slice(s.lastIndexOf("/") + 1).replace(/\.tex$/, "") === i) {
        if (l !== void 0) return "";
        l = r;
      }
    return l ?? "";
  }
  /** True if the main edit OR any changed included file touched labels/numbering. */
  changeTouchesLabels(t, e, n) {
    if (g(t, e)) return !0;
    if (!this.last) return !1;
    const i = /* @__PURE__ */ new Set([...this.last.keys(), ...n.keys()]);
    i.delete(this.mainFile);
    for (const l of i) {
      const s = this.last.get(l) ?? "", r = n.get(l) ?? "";
      if (s !== r && g(s, r)) return !0;
    }
    return !1;
  }
  async ensureCheckpoint(t, e) {
    const n = this.checkpointKey(t, e), i = this.checkpoints.get(n);
    if (i)
      return this.touch(n), { checkpoint: i, built: !1 };
    const { fmt: l, headPdf: s } = await this.engine.buildCheckpoint(t);
    if (!s) throw new Error("checkpoint produced no head PDF");
    const r = { key: n, fmt: l, headPdf: s };
    return this.checkpoints.set(n, r), this.touch(n), this.evict(), { checkpoint: r, built: !0 };
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
    const i = [...o(t).keys()].sort().map((s) => `${s}=${u(this.includedContent(s, e))}`), l = [];
    for (const [s, r] of e)
      s === this.mainFile || s.endsWith(".tex") || l.push(`${s}=${u(r)}`);
    return l.sort(), `${t.length}:${u(t)}|${i.join(",")}|${l.join(",")}`;
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
    return this.last = this.snapshot(t, e), this.lastFullSource = t, this.lastFullFiles = this.snapshot(t, e), this.lastFullSynctexBytes = n.synctex, this.lastFullSynctex = null, {
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
  z as IncrementalCompiler,
  g as editTouchesLabels
};
