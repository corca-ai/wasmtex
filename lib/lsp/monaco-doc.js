function n(t) {
  return {
    path: t.uri ? t.uri.path.replace(/^\//, "") : "",
    getText: () => t.getValue(),
    lineAt: (e) => t.getLineContent(e)
  };
}
export {
  n as modelToDoc
};
