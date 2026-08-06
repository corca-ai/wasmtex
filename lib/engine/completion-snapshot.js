//#region src/engine/completion-snapshot.ts
var e = 1, t = 2097152, n = {
	commands: 8192,
	environments: 1024,
	values: 1024,
	keyFamilies: 512,
	keys: 2048,
	loadedResources: 2048,
	nameLength: 128,
	pathLength: 512,
	rawObservations: 16384
}, r = [
	"commands",
	"environments",
	"colors",
	"counters",
	"lengths",
	"keyFamilies",
	"loadedResources"
], i = /* @__PURE__ */ new Set([
	"csname",
	"group",
	"input",
	"linechar",
	"write"
]);
function a(e, t) {
	return e < t ? -1 : +(e > t);
}
function o(e) {
	return [...new Uint8Array(e)].map((e) => e.toString(16).padStart(2, "0")).join("");
}
async function s(e) {
	let t = typeof e == "string" ? new TextEncoder().encode(e) : Uint8Array.from(e);
	return o(await crypto.subtle.digest("SHA-256", t));
}
async function c(e) {
	let t = [...e].sort((e, t) => a(e.path, t.path)), n = [];
	for (let e of t) {
		let t = typeof e.content == "string" ? "text" : "binary";
		n.push(`${JSON.stringify(e.path)}\t${t}\t${await s(e.content)}`);
	}
	return `sha256:${await s(n.join("\n"))}`;
}
function l(e, t) {
	if (typeof e != "string" || e.length > t) return null;
	let n = e.trim().replaceAll("\\", "/"), r = [...n].some((e) => {
		let t = e.charCodeAt(0);
		return t < 32 || t === 127;
	});
	return !n || n.length > t || r ? null : n;
}
function u(e) {
	return l(e, n.nameLength);
}
function d(e) {
	return {
		status: "unsupported",
		complete: !1,
		values: [],
		reason: e
	};
}
function f(e, t, n = 0, r) {
	return {
		status: "observed",
		complete: t && n === 0,
		values: e,
		...r ? { reason: r } : {},
		...n > 0 ? {
			truncated: !0,
			dropped: n
		} : {}
	};
}
function p(e, t, n = u) {
	let r = /* @__PURE__ */ new Set(), i = 0;
	for (let a of e) {
		let e = n(a);
		if (!e) {
			i++;
			continue;
		}
		r.has(e) || (r.size >= t ? i++ : r.add(e));
	}
	return {
		values: [...r].sort(a),
		dropped: i
	};
}
function m(e) {
	if (typeof e != "string") return null;
	let t = e.endsWith(" "), n = u(t ? e.slice(0, -1) : e);
	return n ? `${n}${t ? " " : ""}` : null;
}
function h(e) {
	if (typeof e != "string" || e.length > n.nameLength + 32) return null;
	let [t, r, i, a] = e.split("	");
	if (a !== void 0) return null;
	let o = m(t);
	if (!o || /[@_:]/.test(o)) return null;
	let s = r === void 0 ? -1 : Number.parseInt(r, 10), c = i === void 0 ? -1 : Number.parseInt(i, 10);
	return {
		name: o,
		eqType: Number.isFinite(s) ? s : -1,
		argCount: Number.isFinite(c) ? Math.max(-1, Math.min(9, c)) : -1
	};
}
function g(e, t, r) {
	if (!e) return d("engine command observation is unavailable");
	let i = /* @__PURE__ */ new Map(), o = Math.max(0, r) + Math.max(0, e.length - n.rawObservations);
	for (let t of e.slice(0, n.rawObservations)) {
		let e = h(t);
		e ? i.set(e.name, e) : o++;
	}
	for (let e of i.values()) {
		if (!e.name.endsWith(" ") || e.argCount <= 0) continue;
		let t = i.get(e.name.trimEnd());
		t && t.argCount <= 0 && (t.argCount = e.argCount);
	}
	let s = [...i.values()].filter((e) => !e.name.endsWith(" ")).sort((e, t) => a(e.name, t.name));
	return s.length > n.commands && (o += s.length - n.commands), f(s.slice(0, n.commands).map((e) => ({
		...e,
		evidence: "engine-hash-table"
	})), t, o, t ? void 0 : "the engine did not report complete command coverage");
}
function _(e) {
	if (e.status === "unsupported") return d("environment observation requires engine command observation");
	let t = new Set(e.values.map((e) => e.name)), r = p([...t].filter((e) => e.startsWith("end") && !i.has(e.slice(3)) && t.has(e.slice(3))).map((e) => e.slice(3)), n.environments);
	return f(r.values.map((e) => ({
		name: e,
		evidence: "engine-hash-table"
	})), e.complete, r.dropped);
}
function v(e, t, r, i, a = 0) {
	if (!t || !e) return d(i);
	let o = e.slice(0, n.rawObservations), s = p(o, n.values);
	return f(s.values.map((e) => ({
		name: e,
		evidence: "engine-hash-table"
	})), r, s.dropped + Math.max(0, e.length - o.length) + Math.max(0, a));
}
function y(e, t, r = 0) {
	if (!e) return d("key-family observation is unavailable for this engine");
	let i = /* @__PURE__ */ new Map(), o = Math.max(0, r) + Math.max(0, e.length - n.rawObservations), s = n.rawObservations;
	for (let t of e.slice(0, n.rawObservations)) {
		let e = u(t.name);
		if (!e) {
			o++;
			continue;
		}
		let n = i.get(e) ?? /* @__PURE__ */ new Set();
		i.set(e, n);
		let r = Array.isArray(t.keys) ? t.keys : [], a = r.slice(0, s);
		s -= a.length, o += r.length - a.length;
		for (let e of a) {
			let t = u(e);
			t ? n.add(t) : o++;
		}
	}
	let c = [...i].sort(([e], [t]) => a(e, t)), l = c.slice(0, n.keyFamilies);
	o += c.slice(n.keyFamilies).reduce((e, [, t]) => e + Math.max(1, t.size), 0);
	let p = n.keys;
	return f(l.map(([e, t]) => {
		let n = [...t].sort(a), r = n.slice(0, p);
		return o += n.length - r.length, p -= r.length, {
			name: e,
			evidence: "engine-hash-table",
			keys: r.map((e) => ({
				name: e,
				evidence: "engine-hash-table"
			}))
		};
	}), t, o);
}
function b(e, t) {
	if (!e) return d("recorder input observation is unavailable");
	let r = e.slice(0, n.rawObservations), i = p(r, n.loadedResources, (e) => l(e, n.pathLength));
	return f(i.values.map((e) => ({
		path: e,
		evidence: "recorder"
	})), t, i.dropped + Math.max(0, e.length - r.length), t ? void 0 : "the engine recorder reported incomplete coverage");
}
function x(e) {
	return JSON.stringify({
		...e,
		estimatedBytes: t
	}).length * 2;
}
function S(e, t) {
	if (e.values.length === 0) return;
	let n = Math.min(t, e.values.length);
	e.values.splice(e.values.length - n, n), e.complete = !1, e.truncated = !0, e.dropped = (e.dropped ?? 0) + n;
}
function C(e, t) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw Error(`completion snapshot has an invalid ${t}`);
	return e;
}
function w(e, t, n) {
	let r = l(e, t);
	if (!r) throw Error(`completion snapshot has an invalid ${n}`);
	return r;
}
function T(e, t) {
	let n = C(e, `${t} field`);
	if (n.status !== "observed" && n.status !== "unsupported") throw Error(`completion snapshot has an invalid ${t} status`);
	if (!Array.isArray(n.values) || typeof n.complete != "boolean") throw Error(`completion snapshot has an invalid ${t} collection`);
	let r = n.reason === void 0 ? void 0 : l(n.reason, 256), i = Number.isSafeInteger(n.dropped) && n.dropped >= 0 ? n.dropped : 0;
	return {
		values: n.values,
		status: n.status,
		complete: n.complete,
		...r ? { reason: r } : {},
		dropped: i,
		truncated: n.truncated === !0
	};
}
function E(e, t, r, i) {
	let o = T(e, t);
	if (o.status === "unsupported") {
		if (o.values.length > 0) throw Error(`unsupported completion snapshot field ${t} contains values`);
		return d(o.reason ?? `${t} observation is unavailable`);
	}
	let s = /* @__PURE__ */ new Map(), c = Math.min(o.values.length, n.rawObservations), l = o.dropped + Math.max(0, o.values.length - c);
	for (let e = 0; e < c; e++) {
		let t = i(o.values[e]);
		if (!t) {
			l++;
			continue;
		}
		s.has(t.key) || s.set(t.key, t.value);
	}
	let u = [...s].sort(([e], [t]) => a(e, t));
	l += Math.max(0, u.length - r);
	let p = f(u.slice(0, r).map(([, e]) => e), o.complete, l, o.reason);
	return o.truncated && (p.complete = !1, p.truncated = !0), p;
}
function D(e) {
	let t = e && typeof e == "object" && !Array.isArray(e) ? C(e, "command") : null;
	if (!t) return null;
	let n = u(t.name);
	return !n || /[@_:]/.test(n) || !Number.isSafeInteger(t.eqType) || !Number.isSafeInteger(t.argCount) || t.argCount < -1 || t.argCount > 9 || t.evidence !== "engine-hash-table" ? null : {
		key: n,
		value: {
			name: n,
			eqType: t.eqType,
			argCount: t.argCount,
			evidence: "engine-hash-table"
		}
	};
}
function O(e) {
	let t = e && typeof e == "object" && !Array.isArray(e) ? C(e, "value") : null;
	if (!t || t.evidence !== "engine-hash-table") return null;
	let n = u(t.name);
	return n ? {
		key: n,
		value: {
			name: n,
			evidence: "engine-hash-table"
		}
	} : null;
}
function k(e) {
	if (!e || typeof e != "object" || Array.isArray(e)) return null;
	let t = C(e, "key");
	return t.evidence === "engine-hash-table" ? u(t.name) : null;
}
function A(e, t) {
	if (!e || typeof e != "object" || Array.isArray(e)) return null;
	let n = C(e, "key family"), r = u(n.name);
	if (n.evidence !== "engine-hash-table" || !r || !Array.isArray(n.keys)) return null;
	let i = Math.min(n.keys.length, t), a = Math.max(0, n.keys.length - i), o = /* @__PURE__ */ new Set();
	for (let e = 0; e < i; e++) {
		let t = k(n.keys[e]);
		t ? o.add(t) : a++;
	}
	return {
		name: r,
		keys: [...o],
		dropped: a,
		inspected: i
	};
}
function j(e) {
	let t = T(e, "keyFamilies");
	if (t.status === "unsupported") {
		if (t.values.length > 0) throw Error("unsupported completion snapshot field keyFamilies contains values");
		return d(t.reason ?? "key-family observation is unavailable");
	}
	let r = /* @__PURE__ */ new Map(), i = Math.min(t.values.length, n.rawObservations), o = t.dropped + Math.max(0, t.values.length - i), s = n.rawObservations;
	for (let e = 0; e < i; e++) {
		let n = A(t.values[e], s);
		if (!n) {
			o++;
			continue;
		}
		s -= n.inspected;
		let i = r.get(n.name) ?? /* @__PURE__ */ new Set();
		r.set(n.name, i);
		for (let e of n.keys) i.add(e);
		o += n.dropped;
	}
	let c = [...r].sort(([e], [t]) => a(e, t));
	o += c.slice(n.keyFamilies).reduce((e, [, t]) => e + Math.max(1, t.size), 0);
	let l = n.keys, u = f(c.slice(0, n.keyFamilies).map(([e, t]) => {
		let n = [...t].sort(a), r = n.slice(0, l);
		return o += n.length - r.length, l -= r.length, {
			name: e,
			evidence: "engine-hash-table",
			keys: r.map((e) => ({
				name: e,
				evidence: "engine-hash-table"
			}))
		};
	}), t.complete, o, t.reason);
	return t.truncated && (u.complete = !1, u.truncated = !0), u;
}
function M(e) {
	return E(e, "loadedResources", n.loadedResources, (e) => {
		let t = e && typeof e == "object" && !Array.isArray(e) ? C(e, "resource") : null;
		if (!t || t.evidence !== "recorder") return null;
		let r = l(t.path, n.pathLength);
		return r ? {
			key: r,
			value: {
				path: r,
				evidence: "recorder"
			}
		} : null;
	});
}
function N(e) {
	let i = C(e, "root");
	if (i.version !== 1) throw Error(`unsupported completion snapshot version: ${String(i.version)}`);
	let a = C(i.identity, "identity"), o = w(a.projectRevision, 80, "project revision");
	if (!/^sha256:[a-f0-9]{64}$/.test(o)) throw Error("completion snapshot has an invalid project revision");
	if (![
		"pdflatex",
		"xelatex",
		"lualatex"
	].includes(String(a.engine))) throw Error("completion snapshot has an invalid engine");
	let s = C(a.profile, "profile");
	if (s.texliveYear !== "2025") throw Error("completion snapshot has an invalid TeX Live year");
	let c = s.mirrorRevision === null ? null : w(s.mirrorRevision, 256, "mirror revision"), l = C(i.fields, "fields"), u = {
		version: 1,
		identity: {
			projectRevision: o,
			engine: a.engine,
			root: w(a.root, n.pathLength, "root path"),
			profile: {
				id: w(s.id, n.pathLength, "profile id"),
				texliveYear: "2025",
				mirrorRevision: c
			}
		},
		fields: {
			commands: E(l.commands, "commands", n.commands, D),
			environments: E(l.environments, "environments", n.environments, O),
			colors: E(l.colors, "colors", n.values, O),
			counters: E(l.counters, "counters", n.values, O),
			lengths: E(l.lengths, "lengths", n.values, O),
			keyFamilies: j(l.keyFamilies),
			loadedResources: M(l.loadedResources)
		},
		estimatedBytes: 0
	}, d = x(u);
	for (; d > t;) {
		let e = r.map((e) => u.fields[e]).filter((e) => e.values.length > 0);
		if (e.length === 0) break;
		let t = e.sort((e, t) => t.values.length - e.values.length)[0];
		S(t, Math.max(1, Math.ceil(t.values.length / 8))), d = x(u);
	}
	return u.estimatedBytes = d, u;
}
async function P(e) {
	let t = {
		projectRevision: await c(e.projectFiles),
		engine: e.engine,
		root: e.root,
		profile: { ...e.profile }
	}, n = g(e.engineCommands, e.engineCommandsComplete === !0, e.engineCommandsDropped ?? 0), r = e.engineObservation, i = r?.dropped, a = r?.fieldCompleteness;
	return N({
		version: 1,
		identity: t,
		fields: {
			commands: n,
			environments: _(n),
			colors: v(r?.colors, !!r, a?.colors ?? r?.complete === !0, "color observation is unavailable for this engine", i?.colors),
			counters: v(r?.counters, !!r, a?.counters ?? r?.complete === !0, "counter observation is unavailable for this engine", i?.counters),
			lengths: d("length-register observation is unavailable for this engine"),
			keyFamilies: y(r?.keyFamilies, a?.keyFamilies ?? r?.complete === !0, i?.keyFamilies),
			loadedResources: b(e.inputFiles, e.inputFilesComplete === !0)
		},
		estimatedBytes: 0
	});
}
var F = {
	counter: "counters",
	color: "colors",
	key: "keyFamilies"
};
function I(e, t) {
	let n = e ? F[e] : void 0, r = /^\d+$/.test(t ?? "") ? Number(t) : NaN;
	return n && Number.isSafeInteger(r) && r >= 0 ? {
		kind: "meta",
		field: n,
		dropped: r
	} : null;
}
function L(e) {
	if (typeof e != "string" || e.length > n.nameLength * 2 + 32) return null;
	let [t, r, i] = e.split("	");
	if (t === "meta") return I(r, i);
	let a = u(r);
	if ((t === "counter" || t === "color") && a) return {
		kind: t,
		name: a
	};
	let o = u(i);
	return t === "key" && a && o ? {
		kind: "key",
		family: a,
		name: o
	} : null;
}
function R(e) {
	if (typeof e != "string") return null;
	let t = e.indexOf("	"), n = t >= 0 ? e.slice(0, t) : "";
	return n === "counter" ? "counters" : n === "color" ? "colors" : n === "key" ? "keyFamilies" : null;
}
function z(e, t, n, r, i, a) {
	if (e.kind === "counter") t.push(e.name);
	else if (e.kind === "color") n.push(e.name);
	else if (e.kind === "key") {
		let t = r.get(e.family) ?? [];
		t.push(e.name), r.set(e.family, t);
	} else i[e.field] = e.dropped, a[e.field] = !0;
}
function B(e) {
	let t = [], r = [], i = /* @__PURE__ */ new Map(), a = {
		counters: 0,
		colors: 0,
		keyFamilies: 0
	}, o = {
		counters: 0,
		colors: 0,
		keyFamilies: 0
	}, s = {
		counters: !1,
		colors: !1,
		keyFamilies: !1
	}, c = !1, l = e.length <= n.rawObservations, u = e.slice(0, n.rawObservations);
	for (let e of u) {
		let n = L(e);
		if (!n) {
			let t = R(e);
			t ? o[t]++ : c = !0;
			continue;
		}
		z(n, t, r, i, a, s);
	}
	a.counters += o.counters, a.colors += o.colors, a.keyFamilies += o.keyFamilies;
	let d = l && !c && s.counters && s.colors && s.keyFamilies && a.counters === 0 && a.colors === 0 && a.keyFamilies === 0, f = {
		counters: l && !c && s.counters && a.counters === 0,
		colors: l && !c && s.colors && a.colors === 0,
		keyFamilies: l && !c && s.keyFamilies && a.keyFamilies === 0
	};
	return {
		counters: t,
		colors: r,
		keyFamilies: [...i].map(([e, t]) => ({
			name: e,
			keys: t
		})),
		complete: d,
		fieldCompleteness: f,
		dropped: a
	};
}
//#endregion
export { t as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES, e as COMPLETION_SNAPSHOT_SCHEMA_VERSION, N as boundCompletionSnapshot, c as completionProjectRevision, P as createCompletionSnapshot, B as parseEngineCompletionObservation };
