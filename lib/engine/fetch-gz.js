async function h(t, r) {
  const a = Number.parseInt(t.headers.get("Content-Length") || "0", 10);
  if (!r || !t.body || !a)
    return new Uint8Array(await t.arrayBuffer());
  const f = t.body.getReader(), o = [];
  let n = 0;
  for (; ; ) {
    const { done: e, value: d } = await f.read();
    if (e) break;
    o.push(d), n += d.length, r(Math.min(100, Math.round(n / a * 100)));
  }
  const s = new Uint8Array(n);
  let c = 0;
  for (const e of o)
    s.set(e, c), c += e.length;
  return s;
}
export {
  h as readResponseWithProgress
};
