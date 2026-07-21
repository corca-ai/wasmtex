function s(l, a) {
  return {
    provideRenameEdits: (m, e, c) => {
      const r = m.uri.path.substring(1), i = l.findSymbolAt(r, e.lineNumber, e.column);
      if (!i) return;
      const t = l.findAllOccurrences(i.name, i.type).map((n) => ({
        resource: m.uri.with({ path: `/${n.filePath}` }),
        versionId: void 0,
        textEdit: {
          range: {
            startLineNumber: n.line,
            startColumn: n.column,
            endLineNumber: n.line,
            endColumn: n.column + n.length
          },
          text: c
        }
      }));
      return a && t.length > 0 && a({
        edits: t.map((n) => ({
          file: n.resource.path.substring(1),
          range: n.textEdit.range,
          newText: n.textEdit.text
        }))
      }), { edits: t };
    },
    resolveRenameLocation: (m, e) => {
      const c = m.uri.path.substring(1), r = l.findSymbolAt(c, e.lineNumber, e.column);
      if (!r)
        return Promise.reject("You cannot rename this element.");
      const u = l.findAllOccurrences(r.name, r.type).find(
        (t) => t.filePath === c && t.line === e.lineNumber && e.column >= t.column && e.column <= t.column + t.length
      );
      return {
        range: {
          startLineNumber: e.lineNumber,
          startColumn: u ? u.column : e.column,
          endLineNumber: e.lineNumber,
          endColumn: u ? u.column + u.length : e.column
        },
        text: r.name
      };
    }
  };
}
export {
  s as createRenameProvider
};
