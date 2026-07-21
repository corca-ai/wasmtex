import * as e from "monaco-editor";
function t(n) {
  const i = n.file.startsWith("/") ? n.file : `/${n.file}`;
  return {
    uri: e.Uri.file(i),
    range: new e.Range(n.line, n.column, n.line, n.column)
  };
}
function a(n) {
  const i = n.file.startsWith("/") ? n.file : `/${n.file}`;
  return {
    uri: e.Uri.file(i),
    range: new e.Range(
      n.range.startLine,
      n.range.startColumn,
      n.range.endLine,
      n.range.endColumn
    )
  };
}
export {
  a as neutralLocationToMonaco,
  t as sourceLocationToMonaco
};
