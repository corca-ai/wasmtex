import { createJsonTextBackend as t, BIBER_STAGE as r } from "./backend-registry.js";
function o(e) {
  return t({
    id: "biber",
    stage: r,
    version: e.version,
    endpoint: e.endpoint,
    fetchImpl: e.fetchImpl,
    cacheKey: e.cacheKey
  });
}
async function a(e, c) {
  const n = e?.resolve(r);
  return !n || n.location !== "server" ? null : n.run(c);
}
export {
  r as BIBER_STAGE,
  o as createBiberBackend,
  a as runRemoteBiber
};
