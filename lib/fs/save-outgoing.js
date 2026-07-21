function t(e, i, r) {
  return e.getFile(i) ? (e.writeFile(i, r), !0) : !1;
}
export {
  t as saveOutgoingFile
};
