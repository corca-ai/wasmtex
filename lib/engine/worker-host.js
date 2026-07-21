let e = (r) => new Worker(r);
function t(r) {
  e = r;
}
function n(r) {
  return e(r);
}
export {
  n as createEngineWorker,
  t as setWorkerFactory
};
