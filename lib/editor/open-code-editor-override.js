function l(o, p) {
  const i = o.openCodeEditor, r = (n, d, t) => i.call(o, n, d, t), e = (n, d, t) => p(n, d, t, r);
  return o.openCodeEditor = e, {
    dispose() {
      o.openCodeEditor === e && (o.openCodeEditor = i);
    }
  };
}
export {
  l as installOpenCodeEditorOverride
};
