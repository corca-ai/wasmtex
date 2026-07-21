function r(e) {
  return e.replace(/(^|[^\\])((?:\\\\)*)%.*$/gm, "$1$2");
}
export {
  r as stripTexComments
};
