let e = (r) => new Worker(r);
function t(r) {
  const o = e;
  return e = r, () => {
    e === r && (e = o);
  };
}
function n(r) {
  return e(r);
}
export {
  n as createEngineWorker,
  t as setWorkerFactory
};
