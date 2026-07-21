import { DEFAULT_TEX as t, DEFAULT_ALGEBRA as s, DEFAULT_ANALYSIS as l, DEFAULT_LINALG as r, DEFAULT_REFS_BIB as f } from "./default-project.js";
class h {
  files = /* @__PURE__ */ new Map();
  listeners = [];
  constructor(e) {
    e?.empty || (this.writeFile("main.tex", t), this.writeFile("algebra.tex", s), this.writeFile("analysis.tex", l), this.writeFile("linalg.tex", r), this.writeFile("refs.bib", f));
  }
  writeFile(e, i) {
    this.files.set(e, { path: e, content: i, modified: !0 }), this.notify();
  }
  readFile(e) {
    return this.files.get(e)?.content ?? null;
  }
  deleteFile(e) {
    const i = this.files.delete(e);
    return i && this.notify(), i;
  }
  listFiles() {
    return Array.from(this.files.keys()).sort();
  }
  getFile(e) {
    return this.files.get(e);
  }
  /** Get files that have been modified since last sync */
  getModifiedFiles() {
    return Array.from(this.files.values()).filter((e) => e.modified);
  }
  /**
   * Mark files as synced. When `files` is given, only those exact objects are
   * cleared (by identity) — this avoids clearing the `modified` flag of an edit
   * that arrived (replacing the map entry) after the caller captured the set it
   * actually synced. With no argument, every current file is marked synced.
   */
  markSynced(e) {
    for (const i of e ?? this.files.values())
      i.modified = !1;
  }
  /**
   * Mark every current file as modified so the next sync re-sends all of them.
   * Used after an engine cache flush (which wipes the engine's whole file set):
   * without this, files already marked synced would never be re-written and the
   * next compile would run against an empty engine filesystem.
   */
  markAllModified() {
    for (const e of this.files.values())
      e.modified = !0;
  }
  onChange(e) {
    return this.listeners.push(e), () => {
      const i = this.listeners.indexOf(e);
      i !== -1 && this.listeners.splice(i, 1);
    };
  }
  notify() {
    for (const e of [...this.listeners])
      this.listeners.includes(e) && e();
  }
}
export {
  h as VirtualFS
};
