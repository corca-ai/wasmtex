async function l(t, i, s, a) {
  const e = t.listFiles();
  await s(e);
  const c = [];
  for (const o of e) {
    const n = t.getFile(o);
    n && (await i.writeFile(o, n.content), c.push(n));
  }
  t.markSynced(c), i.setMainFile(a);
}
export {
  l as syncAllFilesToEngine
};
