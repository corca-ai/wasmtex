// Opt-in deterministic metadata for Node engine diagnostics. --require is inherited
// by CommonJS eval worker_threads, so the host and engines use the same clock. Never imported
// by the SDK. performance.now() and engine binaries remain unchanged.
const RealDate = Date
const timestamp = 1789084800000
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [timestamp])) }
  static now() { return timestamp }
}
