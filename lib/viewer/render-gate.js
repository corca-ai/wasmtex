class t {
  generation = 0;
  /** Begin a new render; returns its generation token. Supersedes earlier renders. */
  begin() {
    return ++this.generation;
  }
  /** Whether `token` is still the latest render (not superseded by a later `begin()`). */
  isCurrent(e) {
    return e === this.generation;
  }
  /**
   * Gate a freshly-loaded document for render `token`. Returns `doc` if `token` is still
   * current; otherwise destroys `doc` and returns null (the caller must bail). The caller
   * installs the returned doc as the current document only on a non-null result.
   */
  claim(e, r) {
    return r === this.generation ? e : (e.destroy(), null);
  }
}
export {
  t as RenderGate
};
