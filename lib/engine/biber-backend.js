import { createJsonTextBackend as c } from "./backend-registry.js";
import { BIBLIOGRAPHY_STAGE as r } from "./bibliography-backend.js";
function a(e) {
  return c({
    id: "biber",
    stage: r,
    endpoint: e.endpoint,
    fetchImpl: e.fetchImpl,
    cacheKey: e.cacheKey
  });
}
async function u(e, t) {
  const n = e?.resolve(r);
  return !n || n.location !== "server" ? null : n.run(t);
}
export {
  a as createBiberBackend,
  u as runRemoteBiber
};
