import { simpleHash as n } from "./preamble-utils.js";
function s(e) {
  return e.includes("Rerun to get cross-references right") || e.includes("Rerun to get citations correct") || e.includes("Rerun LaTeX") || e.includes("Label(s) may have changed. Rerun") || e.includes("Please (re)run Biber") || e.includes("Please (re)run BibTeX");
}
class i {
  constructor(r = 5) {
    this.maxReruns = r;
  }
  count = 0;
  lastSignature = null;
  /** Reset between user edits (a fresh document state). */
  reset() {
    this.count = 0, this.lastSignature = null;
  }
  /**
   * @param log        the compile log for the just-finished pass
   * @param signature  a hash of the cross-reference state (aux / trace); use
   *                   {@link signatureOf} if you only have the raw content
   */
  decide(r, t) {
    return s(r) ? this.count >= this.maxReruns ? { rerun: !1, stopped: "limit" } : this.lastSignature !== null && t === this.lastSignature ? { rerun: !1, stopped: "no-progress" } : (this.count++, this.lastSignature = t, { rerun: !0 }) : (this.count = 0, this.lastSignature = null, { rerun: !1 });
  }
}
function a(e) {
  return n(e ?? "");
}
export {
  i as RerunController,
  s as needsRerun,
  a as signatureOf
};
