//#region src/lsp/rename-provider.ts
function e(e, t) {
	return {
		provideRenameEdits: (n, r, i) => {
			let a = n.uri.path.substring(1), o = e.findSymbolAt(a, r.lineNumber, r.column);
			if (!o) return;
			let s = e.findAllOccurrences(o.name, o.type).map((e) => ({
				resource: n.uri.with({ path: `/${e.filePath}` }),
				versionId: void 0,
				textEdit: {
					range: {
						startLineNumber: e.line,
						startColumn: e.column,
						endLineNumber: e.line,
						endColumn: e.column + e.length
					},
					text: i
				}
			}));
			return t && s.length > 0 && t({ edits: s.map((e) => ({
				file: e.resource.path.substring(1),
				range: e.textEdit.range,
				newText: e.textEdit.text
			})) }), { edits: s };
		},
		resolveRenameLocation: (t, n) => {
			let r = t.uri.path.substring(1), i = e.findSymbolAt(r, n.lineNumber, n.column);
			if (!i) return Promise.reject("You cannot rename this element.");
			let a = e.findAllOccurrences(i.name, i.type).find((e) => e.filePath === r && e.line === n.lineNumber && n.column >= e.column && n.column <= e.column + e.length);
			return {
				range: {
					startLineNumber: n.lineNumber,
					startColumn: a ? a.column : n.column,
					endLineNumber: n.lineNumber,
					endColumn: a ? a.column + a.length : n.column
				},
				text: i.name
			};
		}
	};
}
//#endregion
export { e as createRenameProvider };
