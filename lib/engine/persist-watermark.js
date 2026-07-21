async function l(i, n) {
  if (i.inFlight || i.downloadCount === i.lastPersisted) return;
  const r = i.downloadCount;
  i.inFlight = !0;
  try {
    await n(), i.lastPersisted = r;
  } catch {
  } finally {
    i.inFlight = !1;
  }
}
export {
  l as persistIfNeeded
};
