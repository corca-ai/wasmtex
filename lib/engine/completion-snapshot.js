const ee = 1, ne = 2097152, c = {
  commands: 8192,
  environments: 1024,
  values: 1024,
  keyFamilies: 512,
  keys: 2048,
  loadedResources: 2048,
  nameLength: 128,
  pathLength: 512,
  rawObservations: 16384
}, I = [
  "commands",
  "environments",
  "colors",
  "counters",
  "lengths",
  "keyFamilies",
  "loadedResources"
], R = /* @__PURE__ */ new Set(["csname", "group", "input", "linechar", "write"]);
function v(e, n) {
  return e < n ? -1 : e > n ? 1 : 0;
}
function _(e) {
  return [...new Uint8Array(e)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
async function A(e) {
  const n = typeof e == "string" ? new TextEncoder().encode(e) : Uint8Array.from(e);
  return _(await crypto.subtle.digest("SHA-256", n));
}
async function L(e) {
  const n = [...e].sort((s, o) => v(s.path, o.path)), t = [];
  for (const s of n) {
    const o = typeof s.content == "string" ? "text" : "binary";
    t.push(`${JSON.stringify(s.path)}	${o}	${await A(s.content)}`);
  }
  return `sha256:${await A(t.join(`
`))}`;
}
function S(e, n) {
  if (typeof e != "string" || e.length > n) return null;
  const t = e.trim().replaceAll("\\", "/"), s = [...t].some((o) => {
    const i = o.charCodeAt(0);
    return i < 32 || i === 127;
  });
  return !t || t.length > n || s ? null : t;
}
function g(e) {
  return S(e, c.nameLength);
}
function b(e) {
  return { status: "unsupported", complete: !1, values: [], reason: e };
}
function k(e, n, t = 0, s) {
  return {
    status: "observed",
    complete: n && t === 0,
    values: e,
    ...s ? { reason: s } : {},
    ...t > 0 ? { truncated: !0, dropped: t } : {}
  };
}
function O(e, n, t = g) {
  const s = /* @__PURE__ */ new Set();
  let o = 0;
  for (const i of e) {
    const r = t(i);
    if (!r) {
      o++;
      continue;
    }
    s.has(r) || (s.size >= n ? o++ : s.add(r));
  }
  return { values: [...s].sort(v), dropped: o };
}
function j(e) {
  if (typeof e != "string") return null;
  const n = e.endsWith(" "), t = g(n ? e.slice(0, -1) : e);
  return t ? `${t}${n ? " " : ""}` : null;
}
function $(e) {
  if (typeof e != "string" || e.length > c.nameLength + 32) return null;
  const [n, t, s, o] = e.split("	");
  if (o !== void 0) return null;
  const i = j(n);
  if (!i || /[@_:]/.test(i)) return null;
  const r = t === void 0 ? -1 : Number.parseInt(t, 10), a = s === void 0 ? -1 : Number.parseInt(s, 10);
  return {
    name: i,
    eqType: Number.isFinite(r) ? r : -1,
    argCount: Number.isFinite(a) ? Math.max(-1, Math.min(9, a)) : -1
  };
}
function K(e, n, t) {
  if (!e) return b("engine command observation is unavailable");
  const s = /* @__PURE__ */ new Map();
  let o = Math.max(0, t) + Math.max(0, e.length - c.rawObservations);
  for (const r of e.slice(0, c.rawObservations)) {
    const a = $(r);
    a ? s.set(a.name, a) : o++;
  }
  for (const r of s.values()) {
    if (!r.name.endsWith(" ") || r.argCount <= 0) continue;
    const a = s.get(r.name.trimEnd());
    a && a.argCount <= 0 && (a.argCount = r.argCount);
  }
  const i = [...s.values()].filter((r) => !r.name.endsWith(" ")).sort((r, a) => v(r.name, a.name));
  return i.length > c.commands && (o += i.length - c.commands), k(
    i.slice(0, c.commands).map((r) => ({
      ...r,
      evidence: "engine-hash-table"
    })),
    n,
    o,
    n ? void 0 : "the engine did not report complete command coverage"
  );
}
function P(e) {
  if (e.status === "unsupported")
    return b("environment observation requires engine command observation");
  const n = new Set(e.values.map((o) => o.name)), t = [...n].filter(
    (o) => o.startsWith("end") && !R.has(o.slice(3)) && n.has(o.slice(3))
  ).map((o) => o.slice(3)), s = O(t, c.environments);
  return k(
    s.values.map((o) => ({ name: o, evidence: "engine-hash-table" })),
    e.complete,
    s.dropped
  );
}
function F(e, n, t, s, o = 0) {
  if (!n || !e) return b(s);
  const i = e.slice(0, c.rawObservations), r = O(i, c.values);
  return k(
    r.values.map((a) => ({ name: a, evidence: "engine-hash-table" })),
    t,
    r.dropped + Math.max(0, e.length - i.length) + Math.max(0, o)
  );
}
function H(e, n, t = 0) {
  if (!e) return b("key-family observation is unavailable for this engine");
  const s = /* @__PURE__ */ new Map();
  let o = Math.max(0, t) + Math.max(0, e.length - c.rawObservations), i = c.rawObservations;
  for (const u of e.slice(0, c.rawObservations)) {
    const l = g(u.name);
    if (!l) {
      o++;
      continue;
    }
    const m = s.get(l) ?? /* @__PURE__ */ new Set();
    s.set(l, m);
    const p = Array.isArray(u.keys) ? u.keys : [], h = p.slice(0, i);
    i -= h.length, o += p.length - h.length;
    for (const x of h) {
      const E = g(x);
      E ? m.add(E) : o++;
    }
  }
  const r = [...s].sort(([u], [l]) => v(u, l)), a = r.slice(0, c.keyFamilies);
  o += r.slice(c.keyFamilies).reduce((u, [, l]) => u + Math.max(1, l.size), 0);
  let d = c.keys;
  const f = a.map(([u, l]) => {
    const m = [...l].sort(v), p = m.slice(0, d);
    return o += m.length - p.length, d -= p.length, {
      name: u,
      evidence: "engine-hash-table",
      keys: p.map((h) => ({ name: h, evidence: "engine-hash-table" }))
    };
  });
  return k(f, n, o);
}
function q(e, n) {
  if (!e) return b("recorder input observation is unavailable");
  const t = e.slice(0, c.rawObservations), s = O(
    t,
    c.loadedResources,
    (o) => S(o, c.pathLength)
  );
  return k(
    s.values.map((o) => ({ path: o, evidence: "recorder" })),
    n,
    s.dropped + Math.max(0, e.length - t.length),
    n ? void 0 : "the engine recorder reported incomplete coverage"
  );
}
function N(e) {
  return JSON.stringify({
    ...e,
    estimatedBytes: 2097152
  }).length * 2;
}
function z(e, n) {
  if (e.values.length === 0) return;
  const t = Math.min(n, e.values.length);
  e.values.splice(e.values.length - t, t), e.complete = !1, e.truncated = !0, e.dropped = (e.dropped ?? 0) + t;
}
function y(e, n) {
  if (!e || typeof e != "object" || Array.isArray(e))
    throw new Error(`completion snapshot has an invalid ${n}`);
  return e;
}
function C(e, n, t) {
  const s = S(e, n);
  if (!s) throw new Error(`completion snapshot has an invalid ${t}`);
  return s;
}
function T(e, n) {
  const t = y(e, `${n} field`);
  if (t.status !== "observed" && t.status !== "unsupported")
    throw new Error(`completion snapshot has an invalid ${n} status`);
  if (!Array.isArray(t.values) || typeof t.complete != "boolean")
    throw new Error(`completion snapshot has an invalid ${n} collection`);
  const s = t.reason === void 0 ? void 0 : S(t.reason, 256), o = Number.isSafeInteger(t.dropped) && t.dropped >= 0 ? t.dropped : 0;
  return {
    values: t.values,
    status: t.status,
    complete: t.complete,
    ...s ? { reason: s } : {},
    dropped: o,
    truncated: t.truncated === !0
  };
}
function w(e, n, t, s) {
  const o = T(e, n);
  if (o.status === "unsupported") {
    if (o.values.length > 0)
      throw new Error(`unsupported completion snapshot field ${n} contains values`);
    return b(o.reason ?? `${n} observation is unavailable`);
  }
  const i = /* @__PURE__ */ new Map(), r = Math.min(o.values.length, c.rawObservations);
  let a = o.dropped + Math.max(0, o.values.length - r);
  for (let u = 0; u < r; u++) {
    const l = s(o.values[u]);
    if (!l) {
      a++;
      continue;
    }
    i.has(l.key) || i.set(l.key, l.value);
  }
  const d = [...i].sort(([u], [l]) => v(u, l));
  a += Math.max(0, d.length - t);
  const f = k(
    d.slice(0, t).map(([, u]) => u),
    o.complete,
    a,
    o.reason
  );
  return o.truncated && (f.complete = !1, f.truncated = !0), f;
}
function B(e) {
  const n = e && typeof e == "object" && !Array.isArray(e) ? y(e, "command") : null;
  if (!n) return null;
  const t = g(n.name);
  return !t || /[@_:]/.test(t) || !Number.isSafeInteger(n.eqType) || !Number.isSafeInteger(n.argCount) || n.argCount < -1 || n.argCount > 9 || n.evidence !== "engine-hash-table" ? null : {
    key: t,
    value: {
      name: t,
      eqType: n.eqType,
      argCount: n.argCount,
      evidence: "engine-hash-table"
    }
  };
}
function M(e) {
  const n = e && typeof e == "object" && !Array.isArray(e) ? y(e, "value") : null;
  if (!n || n.evidence !== "engine-hash-table") return null;
  const t = g(n.name);
  return t ? { key: t, value: { name: t, evidence: "engine-hash-table" } } : null;
}
function D(e) {
  if (!e || typeof e != "object" || Array.isArray(e)) return null;
  const n = y(e, "key");
  return n.evidence !== "engine-hash-table" ? null : g(n.name);
}
function V(e, n) {
  if (!e || typeof e != "object" || Array.isArray(e)) return null;
  const t = y(e, "key family"), s = g(t.name);
  if (t.evidence !== "engine-hash-table" || !s || !Array.isArray(t.keys)) return null;
  const o = Math.min(t.keys.length, n);
  let i = Math.max(0, t.keys.length - o);
  const r = /* @__PURE__ */ new Set();
  for (let a = 0; a < o; a++) {
    const d = D(t.keys[a]);
    d ? r.add(d) : i++;
  }
  return { name: s, keys: [...r], dropped: i, inspected: o };
}
function W(e) {
  const n = T(e, "keyFamilies");
  if (n.status === "unsupported") {
    if (n.values.length > 0)
      throw new Error("unsupported completion snapshot field keyFamilies contains values");
    return b(n.reason ?? "key-family observation is unavailable");
  }
  const t = /* @__PURE__ */ new Map(), s = Math.min(n.values.length, c.rawObservations);
  let o = n.dropped + Math.max(0, n.values.length - s), i = c.rawObservations;
  for (let u = 0; u < s; u++) {
    const l = V(n.values[u], i);
    if (!l) {
      o++;
      continue;
    }
    i -= l.inspected;
    const m = t.get(l.name) ?? /* @__PURE__ */ new Set();
    t.set(l.name, m);
    for (const p of l.keys) m.add(p);
    o += l.dropped;
  }
  const r = [...t].sort(([u], [l]) => v(u, l));
  o += r.slice(c.keyFamilies).reduce((u, [, l]) => u + Math.max(1, l.size), 0);
  let a = c.keys;
  const d = r.slice(0, c.keyFamilies).map(([u, l]) => {
    const m = [...l].sort(v), p = m.slice(0, a);
    return o += m.length - p.length, a -= p.length, {
      name: u,
      evidence: "engine-hash-table",
      keys: p.map((h) => ({ name: h, evidence: "engine-hash-table" }))
    };
  }), f = k(d, n.complete, o, n.reason);
  return n.truncated && (f.complete = !1, f.truncated = !0), f;
}
function Y(e) {
  return w(e, "loadedResources", c.loadedResources, (n) => {
    const t = n && typeof n == "object" && !Array.isArray(n) ? y(n, "resource") : null;
    if (!t || t.evidence !== "recorder") return null;
    const s = S(t.path, c.pathLength);
    return s ? { key: s, value: { path: s, evidence: "recorder" } } : null;
  });
}
function X(e) {
  const n = y(e, "root");
  if (n.version !== 1)
    throw new Error(`unsupported completion snapshot version: ${String(n.version)}`);
  const t = y(n.identity, "identity"), s = C(t.projectRevision, 80, "project revision");
  if (!/^sha256:[a-f0-9]{64}$/.test(s))
    throw new Error("completion snapshot has an invalid project revision");
  if (!["pdflatex", "xelatex", "lualatex"].includes(String(t.engine)))
    throw new Error("completion snapshot has an invalid engine");
  const o = y(t.profile, "profile");
  if (o.texliveYear !== "2025")
    throw new Error("completion snapshot has an invalid TeX Live year");
  const i = o.mirrorRevision === null ? null : C(o.mirrorRevision, 256, "mirror revision"), r = y(n.fields, "fields"), a = {
    version: 1,
    identity: {
      projectRevision: s,
      engine: t.engine,
      root: C(t.root, c.pathLength, "root path"),
      profile: {
        id: C(o.id, c.pathLength, "profile id"),
        texliveYear: "2025",
        mirrorRevision: i
      }
    },
    fields: {
      commands: w(
        r.commands,
        "commands",
        c.commands,
        B
      ),
      environments: w(
        r.environments,
        "environments",
        c.environments,
        M
      ),
      colors: w(r.colors, "colors", c.values, M),
      counters: w(r.counters, "counters", c.values, M),
      lengths: w(r.lengths, "lengths", c.values, M),
      keyFamilies: W(r.keyFamilies),
      loadedResources: Y(r.loadedResources)
    },
    estimatedBytes: 0
  };
  let d = N(a);
  for (; d > 2097152; ) {
    const f = I.map((l) => a.fields[l]).filter(
      (l) => l.values.length > 0
    );
    if (f.length === 0) break;
    const u = f.sort((l, m) => m.values.length - l.values.length)[0];
    z(u, Math.max(1, Math.ceil(u.values.length / 8))), d = N(a);
  }
  return a.estimatedBytes = d, a;
}
async function te(e) {
  const n = {
    projectRevision: await L(e.projectFiles),
    engine: e.engine,
    root: e.root,
    profile: { ...e.profile }
  }, t = K(
    e.engineCommands,
    e.engineCommandsComplete === !0,
    e.engineCommandsDropped ?? 0
  ), s = e.engineObservation, o = s?.dropped, i = s?.fieldCompleteness, r = {
    commands: t,
    environments: P(t),
    colors: F(
      s?.colors,
      !!s,
      i?.colors ?? s?.complete === !0,
      "color observation is unavailable for this engine",
      o?.colors
    ),
    counters: F(
      s?.counters,
      !!s,
      i?.counters ?? s?.complete === !0,
      "counter observation is unavailable for this engine",
      o?.counters
    ),
    lengths: b("length-register observation is unavailable for this engine"),
    keyFamilies: H(
      s?.keyFamilies,
      i?.keyFamilies ?? s?.complete === !0,
      o?.keyFamilies
    ),
    loadedResources: q(e.inputFiles, e.inputFilesComplete === !0)
  };
  return X({ version: 1, identity: n, fields: r, estimatedBytes: 0 });
}
const U = {
  counter: "counters",
  color: "colors",
  key: "keyFamilies"
};
function J(e, n) {
  const t = e ? U[e] : void 0, s = /^\d+$/.test(n ?? "") ? Number(n) : Number.NaN;
  return t && Number.isSafeInteger(s) && s >= 0 ? { kind: "meta", field: t, dropped: s } : null;
}
function G(e) {
  if (typeof e != "string" || e.length > c.nameLength * 2 + 32) return null;
  const [n, t, s] = e.split("	");
  if (n === "meta") return J(t, s);
  const o = g(t);
  if ((n === "counter" || n === "color") && o)
    return { kind: n, name: o };
  const i = g(s);
  return n === "key" && o && i ? { kind: "key", family: o, name: i } : null;
}
function Q(e) {
  if (typeof e != "string") return null;
  const n = e.indexOf("	"), t = n >= 0 ? e.slice(0, n) : "";
  return t === "counter" ? "counters" : t === "color" ? "colors" : t === "key" ? "keyFamilies" : null;
}
function Z(e, n, t, s, o, i) {
  if (e.kind === "counter") n.push(e.name);
  else if (e.kind === "color") t.push(e.name);
  else if (e.kind === "key") {
    const r = s.get(e.family) ?? [];
    r.push(e.name), s.set(e.family, r);
  } else
    o[e.field] = e.dropped, i[e.field] = !0;
}
function oe(e) {
  const n = [], t = [], s = /* @__PURE__ */ new Map(), o = { counters: 0, colors: 0, keyFamilies: 0 }, i = { counters: 0, colors: 0, keyFamilies: 0 }, r = { counters: !1, colors: !1, keyFamilies: !1 };
  let a = !1;
  const d = e.length <= c.rawObservations, f = e.slice(0, c.rawObservations);
  for (const m of f) {
    const p = G(m);
    if (!p) {
      const h = Q(m);
      h ? i[h]++ : a = !0;
      continue;
    }
    Z(p, n, t, s, o, r);
  }
  o.counters += i.counters, o.colors += i.colors, o.keyFamilies += i.keyFamilies;
  const u = d && !a && r.counters && r.colors && r.keyFamilies && o.counters === 0 && o.colors === 0 && o.keyFamilies === 0, l = {
    counters: d && !a && r.counters && o.counters === 0,
    colors: d && !a && r.colors && o.colors === 0,
    keyFamilies: d && !a && r.keyFamilies && o.keyFamilies === 0
  };
  return {
    counters: n,
    colors: t,
    keyFamilies: [...s].map(([m, p]) => ({ name: m, keys: p })),
    complete: u,
    fieldCompleteness: l,
    dropped: o
  };
}
export {
  ne as COMPLETION_SNAPSHOT_MAX_ESTIMATED_BYTES,
  ee as COMPLETION_SNAPSHOT_SCHEMA_VERSION,
  X as boundCompletionSnapshot,
  L as completionProjectRevision,
  te as createCompletionSnapshot,
  oe as parseEngineCompletionObservation
};
