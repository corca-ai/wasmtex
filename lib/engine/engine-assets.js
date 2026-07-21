function t(e, r, n) {
  return `${e}wasmtex/${r}/wasmtex-${n}`;
}
function o(e, r, n) {
  return `${t(e, r, n)}.worker.js`;
}
function u(e, r, n) {
  return `${t(e, r, n)}.fmt`;
}
export {
  u as engineFormatUrl,
  o as engineWorkerUrl
};
