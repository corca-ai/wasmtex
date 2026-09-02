//#region src/engine/resolver-evidence.ts
var e = 1024, t = /* @__PURE__ */ new Set([
	"warmup-cache",
	"persistent-cache",
	"session-cache",
	"warmup-negative",
	"durable-negative",
	"bloom-filter",
	"network"
]), n = /* @__PURE__ */ new Set([
	"hit",
	"not-found",
	"transport-error"
]), r = /* @__PURE__ */ new Set([
	"resolved",
	"mirror-absent",
	"transport-error"
]);
function i(e) {
	return typeof e == "string" && e.length > 0 && e.length <= 512 && !e.includes("/") && !e.includes("\\") && !/[\r\n\0]/.test(e);
}
function a(e) {
	if (!e || typeof e != "object") return null;
	let r = e;
	if (!t.has(r.source) || !n.has(r.outcome)) return null;
	let a = {
		source: r.source,
		outcome: r.outcome
	};
	return i(r.candidate) && (a.candidate = r.candidate), typeof r.status == "number" && Number.isSafeInteger(r.status) && r.status >= 100 && r.status <= 599 && (a.status = r.status), a;
}
function o(e, t) {
	if (!i(t.requestedName) || typeof t.format != "number" || !Number.isSafeInteger(t.format) || t.format < 0 || !r.has(t.outcome) || !Array.isArray(t.attempts)) return null;
	let n = t.attempts.slice(0, 8).map(a);
	return n.some((e) => e === null) || n.length === 0 ? null : {
		stage: e,
		requestedName: t.requestedName,
		format: t.format,
		outcome: t.outcome,
		attempts: n
	};
}
function s(e) {
	return e.attempts.some((e) => e.source === "network" && e.outcome === "hit");
}
var c = class {
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
	record(t) {
		if (!this.active) return;
		let n = o(this.stage, t);
		if (!n) return;
		let r = `${n.stage}\0${n.format}\0${n.requestedName}`, i = this.entries.get(r);
		if (!i && this.entries.size >= e) {
			this.dropped++;
			return;
		}
		i?.outcome === "resolved" && n.outcome === "resolved" && s(i) && !s(n) || this.entries.set(r, n);
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
function l(t, n) {
	let r = [], i = 0;
	for (let t of n) if (t) {
		i += t.dropped;
		for (let n of t.entries) r.length < e ? r.push(n) : i++;
	}
	return {
		schemaVersion: 1,
		profile: { ...t },
		entries: r,
		dropped: i,
		complete: i === 0
	};
}
//#endregion
export { c as ResolverEvidenceCollector, l as mergeResolverReports };
