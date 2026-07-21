import { modelToDoc as n } from "./monaco-doc.js";
import { provideReferences as m } from "./neutral-providers.js";
import { neutralLocationToMonaco as c } from "./source-position-monaco.js";
function u(r) {
  return {
    provideReferences(o, e) {
      return m(
        n(o),
        { line: e.lineNumber, column: e.column },
        r
      ).map(c);
    }
  };
}
export {
  u as createReferenceProvider
};
