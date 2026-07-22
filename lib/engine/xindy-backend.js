import { createJsonTextBackend as n, INDEX_STAGE as c } from "./backend-registry.js";
function r(e) {
  return n({
    id: "xindy",
    stage: c,
    version: e.version,
    endpoint: e.endpoint,
    fetchImpl: e.fetchImpl,
    cacheKey: e.cacheKey
  });
}
export {
  r as createXindyBackend
};
