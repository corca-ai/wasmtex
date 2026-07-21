import { createJsonTextBackend as n } from "./backend-registry.js";
function t(e) {
  return n({
    id: "xindy",
    stage: "index",
    endpoint: e.endpoint,
    fetchImpl: e.fetchImpl,
    cacheKey: e.cacheKey
  });
}
export {
  t as createXindyBackend
};
