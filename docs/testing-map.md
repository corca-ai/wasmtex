# Runtime verification map

This is the maintained behavior map for the compile/host execution layer. Use it
with the [development commands](develop.md#testing) and
[execution contract](execution-model.md), not as a claim of complete engine
qualification. The [engine optimization policy](engine-optimization-policy.md)
remains the authority for changed engine artifacts and supported annual profiles.

## Test levels and gates

- **Unit/protocol**: `npm test` runs the ordinary Vitest suite locally, in
  pre-commit and in the CI `build` job on every PR. Some tests substitute an
  engine/Worker transport; others execute authored JavaScript in a VM. Neither
  proves generated WASM behavior. Source-text guards are identified below.
- **Coverage**: `npm run test:coverage` runs the same suite with V8 instrumentation
  in pre-push and CI `coverage`. All four aggregate thresholds are 85%; env-gated
  tests remain skipped unless explicitly enabled. This measures the configured
  TypeScript subset, not every SDK/worker/WASM path.
- **Annual output gate**: [Golden Canary](../.github/workflows/golden-canary.yml)
  runs both pinned engine/mirror profiles for PRs touching its source/build/test
  path scope, weekly, and on manual dispatch. It requires all seven goldens and
  runs browser output/SyncTeX, Node structural parity and actual bibliography,
  headless cancellation/project replacement, authored cold-format fallback, and
  persistent-cache browser tests. The aggregate `output-regression` job fails
  when a required annual job fails. Documentation-only PRs can skip the matrix.
- **Other PR gates**: [CI](../.github/workflows/ci.yml) always runs both annual
  nested-output Node/browser tests, isolated package consumption, library
  freshness, typecheck, lint (including authored Workers), and script tests.
- **Manual qualification**: the full `npm run test:e2e` suite and env-gated
  specialized smoke/differential suites are not all part of the annual output
  job. A test file's presence is not evidence that a PR ran it. Use the matching
  annual mirror and record the command, candidate artifacts and result.

## Behavior, evidence and remaining gaps

Paths below are representative owners, not counts of all tests. A failure or
race named in a unit row is bounded by that test's substituted collaborators.

| Behavior / failure or race | Unit or protocol evidence (default PR suite) | Real runtime evidence / gate | Remaining scope |
| --- | --- | --- | --- |
| Compile ownership; overlapping calls; edit/dispose while work is pending; stale results | [headless-lifecycle](../src/headless-lifecycle.test.ts), [compiler-operation](../src/engine/compiler-operation.test.ts), [prebuild](../src/headless-incremental-prebuild.test.ts) use controlled promises, including cancellation after I/O settles but before continuation. | [headless-lifecycle smoke](../src/engine/headless-lifecycle.smoke.test.ts) interrupts an actual Node TeX job and replaces/reuses projects; annual gate. | No exhaustive browser cancellation timing matrix or every engine-family cancellation point. |
| Engine selection and replacement; unavailable Unicode assets; throwing/rejecting observers | [headless-engine-selection](../src/headless-engine-selection.test.ts) covers actual kind transitions, immutable event data and observer isolation; lifecycle tests retire active work. | [nested-output smoke](../src/engine/nested-output.smoke.test.ts) and [browser counterpart](../e2e/nested-output.spec.ts) exercise all three engines and failure recovery on every PR. | Running each family does not cover all pairwise auto-selection transitions under concurrent edits. UI remains intentionally pdfLaTeX-only. |
| File synchronization; edits arriving during full or incremental sync | [headless-sync](../src/headless-sync.test.ts) preserves unsent revisions; [filesystem](../src/fs/virtual-fs.test.ts) tests file state. The sync test accesses private sync methods with a gated engine. | Annual headless replacement and nested-output cases exercise real writes. [project-switch-images](../src/engine/project-switch-images.smoke.test.ts) is an opt-in baseline/candidate sequence. | Deletion/binary/project-switch combinations are not an exhaustive PR matrix; run the image sequence for affected engine changes. |
| Bibliography/index stages; rerun convergence, no-progress and limits; late backend reply | [bibliography-backend](../src/engine/bibliography-backend.test.ts), [biber-backend](../src/engine/biber-backend.test.ts), [rerun-controller](../src/engine/rerun-controller.test.ts), headless lifecycle/dependency tests. | Annual browser/Node goldens include real BibTeX `.bbl` content and structural PDF output after makeindex. [Biber server e2e](../src/engine/biber-server.e2e.test.ts) is separately env-gated. | The dedicated `makeindex.spec.ts` checks `.ind` content in the manual full browser suite. Real remote-backend outage/cancel/recovery is not in the standard PR matrix. Unit transport failures do not qualify a deployed Biber service. |
| Result metadata, resolver/dependency evidence, revision freshness and source navigation | [headless-dependency-manifest](../src/headless-dependency-manifest.test.ts), [headless-texlive-dependencies](../src/headless-texlive-dependencies.test.ts), [completion-snapshot](../src/engine/completion-snapshot.test.ts), resolver tests. | Annual goldens check geometry/diagnostics and known source positions on cold/repeat compiles; parity compares structural signatures. | Structural goldens are not byte-for-byte PDF or exhaustive dependency-completeness checks; XeLaTeX completeness remains limited by its execution contract. |
| Worker request FIFO, send exception/retry, crash and termination | [base-worker-engine](../src/engine/base-worker-engine.test.ts) covers send failure with/without transfers, neighboring same-key waiters and cancellation; [wasmtex-worker](../src/engine/wasmtex-worker.test.ts) covers init retry/foreign errors; [driver tests](../src/engine/wasmtex-engine.test.ts) cover crash after init. | Annual real Node lifecycle/cold-format commands exercise the transport; no deliberate WASM OOM injection in the PR matrix. | Transport failure is injected at the Worker port in units; it does not recreate every browser crash or detached-buffer condition. |
| Host installation, duplicate rejection, out-of-order disposal and browser fallback | [worker-host](../src/engine/worker-host.test.ts) exercises live factory registration/fallback; [node-host-lifecycle](../src/engine/node-host-lifecycle.test.ts) uses temporary assets and a real Node worker thread, including setup rollback. | Node annual parity exercises the installed host with real engines; browser annual goldens exercise browser Workers. | Multiple active Node hosts and independently bundled SDK copies sharing globals are not supported. The fallback unit substitutes the browser constructor. |
| Package cache identity, clear-versus-pending-save, preamble reuse and checkpoint state | [cache identity](../src/engine/persistent-cache-identity.test.ts), [engine cache integration](../src/engine/persistent-cache-engines.test.ts), [cache storage](../src/engine/persistent-cache.test.ts), [preamble-cache](../src/engine/preamble-cache.test.ts), [incremental](../src/engine/incremental.test.ts), [heap restore](../src/engine/worker-heap-restore.test.ts) and warmup units. | Annual [persistent-cache browser tests](../e2e/persistent-cache.spec.ts) use actual IndexedDB and cold/warm/clear output. [heap checkpoints](../e2e/heap-checkpoints.spec.ts), [incremental e2e](../e2e/incremental-e2e.spec.ts), `P2GT=1` SyncTeX smoke and Unicode differential suites are manual. | Cross-tab cache races, storage eviction/quota behavior and full engine/checkpoint transitions are not exhaustively automated. A VM heap test is not a rebuilt-WASM qualification. |
| Missing base format; INITEX failure/retry; project preservation; normal format reuse | [worker-format-fallback](../src/engine/worker-format-fallback.test.ts) runs the authored controller with filesystem/TeX-core substitutes, preserving nested binary inputs even on failure. | [cold-format smoke](../src/engine/worker-format-fallback.smoke.test.ts) overlays this checkout's controller on pinned WASM and verifies cold/repeat/edited input with preamble caching on/off in both annual jobs. Normal baseline/candidate PDF and preloaded-state checks are recorded in [#151](https://github.com/corca-ai/wasmtex/issues/151). | Local controller overlays do not publish an engine release. Normal differential PDF/state qualification remains a separate engine-change task. |
| Shipped entry points, neutral imports and consumer type resolution | [headless-boundary](../src/headless-boundary.test.ts) is a static import-graph guard. | [package-consumer probe](../scripts/package-consumer/check.mjs) packs/installs outside the repo, executes neutral imports, checks NodeNext/Bundler with tsc/tsgo, and builds the UI consumer on every PR. | This verifies a tarball, not GitHub transport/authentication, every package manager or script-enabled `prepare`. |

Additional static guards in `worker-controller.test.ts` and parts of
`worker-job-name.test.ts` inspect source text. The latter also executes extracted
job-name helpers. Keep them as maintenance checks; the nested-output and actual
controller/runtime suites establish behavior. Worker Biome lint similarly
catches undeclared variables but does not type-check the dynamic message protocol.

## Priority decisions from quality tracking

[Tracking #144](https://github.com/corca-ai/wasmtex/issues/144) addressed the
highest-risk gaps through separately reviewed work:

1. [#145](https://github.com/corca-ai/wasmtex/issues/145) made representative output,
   source navigation and host parity required for core PRs.
2. [#147](https://github.com/corca-ai/wasmtex/issues/147) added ownership/revision race
   coverage and a real interrupted-compile/project replacement gate.
3. [#148](https://github.com/corca-ai/wasmtex/issues/148),
   [#149](https://github.com/corca-ai/wasmtex/issues/149) and
   [#150](https://github.com/corca-ai/wasmtex/issues/150) cover cache identity,
   actual package consumption and host registration lifetimes respectively.
4. [#151](https://github.com/corca-ai/wasmtex/issues/151) filled the authored static
   gap and caught a real cold-format/file-loss defect, now protected by units
   and both annual actual-core runs.
5. [#152](https://github.com/corca-ai/wasmtex/issues/152) found a further send-failure
   gap: a rejected `postMessage` left a waiter that consumed a retry's reply.
   The regression tests fail before the fix, preserve neighboring FIFO waiters,
   and confirm the original send error reaches the caller. No policy extraction
   or new production testing interface was needed.

The separate LSP request-lifetime/input-validation work in
[#146](https://github.com/corca-ai/wasmtex/issues/146) has its own default unit gate
in `lsp-server.test.ts`; it is not evidence for Worker compile cancellation.

## Coverage interpretation and maintenance

`vitest.config.ts` remains the exact denominator. Runtime drivers, headless/UI
orchestration and entry points are partly excluded, although many have the
focused tests above. Their current instrumentation combines substituted effects,
DOM/WASM integration and barrel imports, so an aggregate percentage cannot
establish their runtime completeness. Exclusion does not imply test absence or
an inherent inability to write units. VM-evaluated authored JS and generated
WASM are outside the TypeScript coverage report altogether.

The unnecessary exclusions for `worker-host.ts` and `base-worker-engine.ts` were
removed: these are directly testable host-selection/request-queue contracts,
with no need to boot WASM. Their coverage now participates in the existing 85%
aggregate gate; no threshold was lowered. Other exclusions are retained pending
per-file evidence, not as a permanent prohibition on adding them.

This page owns the map; the development guide owns commands. When a PR changes
an execution contract, adds a failure/race test, changes an env flag, moves a
suite between default/manual/CI gates, or adjusts coverage exclusions, update the
matching row and remaining-gap statement in the same PR. Verify links, inspect
the actual assertions and workflow steps, and run `awiki lint -root docs`.
Do not replace gaps with a coverage percentage or label a manual test as a gate
because it happens to have run once. Keep dated run logs and exact artifact
identities in the associated issue/PR or governed history, not in this living map.
