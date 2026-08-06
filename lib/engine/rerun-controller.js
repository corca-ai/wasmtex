import { simpleHash as e } from "./preamble-utils.js";
//#region src/engine/rerun-controller.ts
function t(e) {
	return e.includes("Rerun to get cross-references right") || e.includes("Rerun to get citations correct") || e.includes("Rerun LaTeX") || e.includes("Label(s) may have changed. Rerun") || e.includes("Please (re)run Biber") || e.includes("Please (re)run BibTeX");
}
var n = class {
	maxReruns;
	count = 0;
	lastSignature = null;
	constructor(e = 5) {
		this.maxReruns = e;
	}
	reset() {
		this.count = 0, this.lastSignature = null;
	}
	decide(e, n) {
		return t(e) ? this.count >= this.maxReruns ? {
			rerun: !1,
			stopped: "limit"
		} : this.lastSignature !== null && n === this.lastSignature ? {
			rerun: !1,
			stopped: "no-progress"
		} : (this.count++, this.lastSignature = n, { rerun: !0 }) : (this.count = 0, this.lastSignature = null, { rerun: !1 });
	}
};
function r(t) {
	return e(t ?? "");
}
//#endregion
export { n as RerunController, t as needsRerun, r as signatureOf };
