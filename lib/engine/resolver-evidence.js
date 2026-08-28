//#region src/engine/resolver-evidence.ts
var e = /* @__PURE__ */ new Set([
	"warmup-cache",
	"persistent-cache",
	"session-cache",
	"warmup-negative",
	"durable-negative",
	"bloom-filter",
	"network"
]), t = /* @__PURE__ */ new Set([
	"hit",
	"not-found",
	"transport-error"
]), n = /* @__PURE__ */ new Set([
	"resolved",
	"mirror-absent",
	"transport-error"
]);
function r(e) {
	return typeof e == "string" && e.length > 0 && e.length <= 512 && !e.includes("/") && !e.includes("\\") && !/[\r\n\0]/.test(e);
}
function i(n) {
	if (!n || typeof n != "object") return null;
	let i = n;
	if (!e.has(i.source) || !t.has(i.outcome)) return null;
	let a = {
		source: i.source,
		outcome: i.outcome
	};
	return r(i.candidate) && (a.candidate = i.candidate), typeof i.status == "number" && Number.isSafeInteger(i.status) && i.status >= 100 && i.status <= 599 && (a.status = i.status), a;
}
function a(e, t) {
	if (!r(t.requestedName) || typeof t.format != "number" || !Number.isSafeInteger(t.format) || t.format < 0 || !n.has(t.outcome) || !Array.isArray(t.attempts)) return null;
	let a = t.attempts.slice(0, 8).map(i);
	return a.some((e) => e === null) || a.length === 0 ? null : {
		stage: e,
		requestedName: t.requestedName,
		format: t.format,
		outcome: t.outcome,
		attempts: a
	};
}
var o = class {
	stage;
	profile;
	supported = !1;
	active = !1;
	entries = /* @__PURE__ */ new Map();
	dropped = 0;
	constructor(e, t) {
		this.stage = e, this.profile = t;
	}
	markSupported() {
		this.supported = !0;
	}
	begin() {
		this.active = !0, this.entries.clear(), this.dropped = 0;
	}
	record(e) {
		if (!this.active) return;
		let t = a(this.stage, e);
		if (!t) return;
		let n = `${t.stage}\0${t.format}\0${t.requestedName}`;
		if (!this.entries.has(n) && this.entries.size >= 256) {
			this.dropped++;
			return;
		}
		this.entries.set(n, t);
	}
	finish() {
		if (this.active = !1, this.supported) return {
			schemaVersion: 1,
			profile: { ...this.profile },
			entries: [...this.entries.values()],
			dropped: this.dropped,
			complete: this.dropped === 0
		};
	}
};
function s(e, t) {
	let n = [], r = 0;
	for (let e of t) if (e) {
		r += e.dropped;
		for (let t of e.entries) n.length < 256 ? n.push(t) : r++;
	}
	return {
		schemaVersion: 1,
		profile: { ...e },
		entries: n,
		dropped: r,
		complete: r === 0
	};
}
//#endregion
export { o as ResolverEvidenceCollector, s as mergeResolverReports };
