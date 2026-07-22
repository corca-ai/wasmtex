import { createJsonTextBackend as c, INDEX_STAGE as r } from "./backend-registry.js";
import { stripTexComments as i } from "./tex-comments.js";
function a(e) {
  const n = i(e);
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
    version: e.version,
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
