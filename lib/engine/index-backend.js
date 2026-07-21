import { createJsonTextBackend as c } from "./backend-registry.js";
import { stripTexComments as o } from "./tex-comments.js";
const r = "index";
function a(e) {
  const n = o(e);
  return /\\makeindex\b/.test(n) && /\\printindex\b/.test(n);
}
async function m(e, n) {
  const t = e?.resolve(r);
  return !t || t.location !== "server" ? null : t.run(n);
}
function s(e) {
  return c({
    id: "makeindex",
    stage: r,
    endpoint: e.endpoint,
    fetchImpl: e.fetchImpl,
    cacheKey: e.cacheKey
  });
}
export {
  r as INDEX_STAGE,
  s as createMakeindexBackend,
  a as detectIndexUse,
  m as runRemoteIndex
};
