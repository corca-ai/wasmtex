/**
 * Generation gate for overlapping async renders (#137).
 *
 * A PDF render is async (load doc → getPage → paint → index). If a newer render starts
 * while an older one is mid-flight, the older one must not corrupt shared state. This gate
 * is the single source of truth for "which render is current", decoupled from the DOM so
 * the supersede/destroy race is unit-testable on its own.
 *
 * - `begin()` starts a render and returns its token (supersedes all earlier renders).
 * - `isCurrent(token)` gates each await/loop step — a superseded step must stop.
 * - `claim(doc, token)` decides a freshly-loaded document's fate: keep it only if `token`
 *   is still current, otherwise **destroy that just-loaded doc and return null** so the
 *   caller bails. A stale render therefore destroys *its own* document and never installs
 *   it — the shared "current document" is never overwritten by, nor left pointing at, a
 *   destroyed doc.
 */
export class RenderGate {
  private generation = 0

  /** Begin a new render; returns its generation token. Supersedes earlier renders. */
  begin(): number {
    return ++this.generation
  }

  /** Whether `token` is still the latest render (not superseded by a later `begin()`). */
  isCurrent(token: number): boolean {
    return token === this.generation
  }

  /**
   * Gate a freshly-loaded document for render `token`. Returns `doc` if `token` is still
   * current; otherwise destroys `doc` and returns null (the caller must bail). The caller
   * installs the returned doc as the current document only on a non-null result.
   */
  claim<D extends { destroy(): void }>(doc: D, token: number): D | null {
    if (token === this.generation) return doc
    doc.destroy()
    return null
  }
}
