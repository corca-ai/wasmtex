/* Host-local TeX Live resolver evidence shared by every authored engine worker.
 * The TypeScript host validates the payload again before exposing it publicly. */
self.wasmtexResolverEvidence = function (requestedName, format, outcome, attempts) {
  var safeAttempts = Array.isArray(attempts) ? attempts.slice(0, 8) : []
  self.postMessage({
    cmd: 'resolver',
    evidence: {
      requestedName: String(requestedName).slice(0, 512),
      format: format,
      outcome: outcome,
      attempts: safeAttempts,
    },
  })
}
self.postMessage({ cmd: 'resolverready', schemaVersion: 1 })
