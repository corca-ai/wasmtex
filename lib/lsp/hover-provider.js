import * as m from "monaco-editor";
import { modelToDoc as a } from "./monaco-doc.js";
import { provideHover as i } from "./neutral-providers.js";
function l(n) {
  return {
    provideHover(o, r) {
      const e = i(
        a(o),
        { line: r.lineNumber, column: r.column },
        n
      );
      return e ? {
        contents: e.contents.map((t) => ({ value: t })),
        range: new m.Range(
          e.range.startLine,
          e.range.startColumn,
          e.range.endLine,
          e.range.endColumn
        )
      } : null;
    }
  };
}
export {
  l as createHoverProvider
};
