# Engine optimization compatibility policy

Engine performance changes must preserve the existing TeX Live environment,
format files, and author-visible behavior. This is the required contract for
changes to engine internals, build flags, memory management, and execution glue
released as transparent optimizations. Read it before designing such a change.
An internal engine patch is permitted when it satisfies this contract; its
location alone is not a reason to reject an optimization.

The [compile performance record](compile-performance.md) applies this contract
to the September 2026 experiments and links their qualification evidence.

## Required outcome

Integrating applications must be able to deliver the optimization to existing projects without editing
sources, migrating projects, selecting another profile, or gaining another TeX
Live choice. The selected TeX Live label and snapshot date, document output,
and supported behavior stay the same. Faster execution and lower resource use
are the intended differences. New engine downloads and automatic rebuilding of
engine-bound caches are allowed; manual cache clearing is not a deployment step.

A change that needs new packages, different format bytes, altered typesetting,
or a user-selected migration does not qualify. Redesign it to meet this policy,
or treat it as a separately scoped compatibility/feature change; do not silently
relax this contract or promote it through the optimization successor path.

## Keep the identities separate

| Item | Requirement for a transparent optimization |
| --- | --- |
| TeX Live year and package snapshot date | Keep unchanged for each affected profile. |
| Upstream TeX Live source pin | Keep unchanged; express local changes in the tracked build inputs. |
| R2 mirror objects, URL, and `mirrorRevision` | Reuse the exact immutable snapshot. |
| Packages, fonts, font databases, ICU data, Bloom filters, and catalogs | Keep their existing bytes and interpretation. |
| Published base `.fmt` and `.fmt.gz` | Reuse the exact baseline artifacts, including compressed bytes where shipped. |
| Engine WASM, generated JavaScript, and authored controller | Publish changed files as a new immutable engine release. |
| Release ID, hashes, build receipts, and corresponding source | Record the actual candidate inputs and bytes; never reuse a stale identity. |
| Integrator-owned internal compile profile | Register the new engine/mirror combination and a verified successor mapping. |
| Integrator-owned stored project selection and visible choices | Preserve stored IDs and the existing choice count, labels, and snapshot dates. |

An engine release and a TeX Live release are independent changes. Integrators
bind the engine revision to an unchanged mirror and own project-profile
resolution, storage, and selection UI. The SDK accepts generic asset locations
and profile identities; it must not import an application's source, assume its
storage schema, or require its checkout to build, test, or release.

Cross-repository experiments may qualify an application against an SDK candidate.
That is integration evidence, not a reverse dependency or an application-specific
SDK release gate. WasmTex's own fixtures and explicitly supplied engine assets
must suffice for standalone verification. This also applies to corresponding
source: integrating-application code does not belong in the engine source unit.

An optimization must not republish the package mirror, overwrite an immutable
engine directory, or invalidate the mirror cache merely to deliver new WASM.
See [mirror operations](texlive-mirror-operations.md) for the publication boundary.

## Format and state compatibility

Existing formats must both load and execute with the same meaning. Preserve
the serialized layout, compatibility checks, primitive meanings, and assumptions
about restored values. An equivalent search algorithm or copy implementation
can qualify; bypassing a format check or rebuilding an incompatible format to
make a test pass cannot.

Qualification must run the candidate with the baseline format files, verify
their hashes, and establish that it actually used them instead of silently
falling back to generating new formats. Cover preamble-format creation and
reuse as well as the base format, repeated compiles, changed documents in one
worker, and memory growth where the modified path can encounter it.

Format compatibility does not establish raw heap-checkpoint compatibility.
Heap checkpoints can depend on code, addresses, JS state, files, and streams.
Retire the old compiler and its checkpoints on an engine transition; do not
resume an old heap under new WASM. The durable preamble cache currently keys
entries by engine build identity and may rebuild automatically. Do not weaken
that key to obtain cross-build cache hits without a separate verified contract.
See [engine formats and caches](engine.md).

## Evidence required before promotion

Record the baseline and candidate release IDs, source/build revisions, exact
mirror, reused format hashes, commands, corpus, environments, and results. Run
the relevant checks for every affected supported annual line and engine family.
Do not infer compatibility from a small diff, successful format loading, or one
successful document.

1. Compare baseline and candidate PDFs using
   `scripts/check-output-preservation.mjs`, with the same mirror and explicit
   engine/year arguments. Its comparison removes only creation/modification
   dates and document IDs; do not broaden normalization to hide output changes.
   The current script runs single-file fixtures under Node at root and nested
   paths, defaults to pdfLaTeX/2026, and allows recovery of a missing baseline
   PDF. Passing it alone is not evidence for all engines or unchanged behavior.
2. Verify SyncTeX/source navigation, auxiliary files and reference convergence,
   diagnostics, dependency/completion evidence, and supported error behavior
   using the relevant suites. Timing and release-identity fields may change;
   observable compile semantics must not. Exercise multi-file projects, fonts,
   bibliography, images, and other features touched by the optimization.
3. Run the applicable browser/Node parity and incremental/checkpoint tests.
   Include cold and warm execution and state-reset regressions, not just the
   first full compile. Extend coverage for the internal state being changed.
4. Measure the claimed performance gain with a representative corpus, including
   initialization, repeated edits, total time through reruns, and peak memory.
   Report costs moved into preload or idle preparation, and any regressions.
   Follow the [development testing guide](develop.md).
5. Complete WasmTex's standalone artifact, receipt, and source-release checks.
   Integrators separately qualify their templates/features and real-browser
   profile/cache transitions before adopting the released SDK or engine.
   Reused formats must retain accurate generation provenance in the new release;
   update assembly tooling if needed rather than inventing a new generation
   receipt for copied bytes. [Corresponding-source releases](corresponding-source.md)
   owns the release procedure.

Existing tools cover parts of these requirements. This document does not claim
that one current command enforces the complete policy. A missing check is work
to complete before promotion, not permission to assume preservation. Do not
refresh golden outputs to accept a difference in an optimization release.

### SDK preparation is part of compatibility

Apply the same contract to SDK warmup and filesystem preparation even when
engine binaries and format bytes are unchanged. Test lookup outcomes before
and after real package/font loading, then repeat and change the document.
Preloading extensionless aliases can make a file exist too early; preloading
canonical names can suppress aliases that the baseline creates on demand.
Both can change valid `\IfFileExists` branches. Preserve those state transitions,
including existing baseline cache behavior, rather than assuming canonical
filenames or ordinary PDF equality establish safety. The
[withdrawn Unicode experiment](compile-performance.md#withdrawn-unicode-startup-experiment)
records the concrete counterexample.

## Integrator adoption and rollback

WasmTex remains host-agnostic. An integrating application owns the following
adoption work; none is a dependency on a particular application's implementation.

1. Register the new immutable engine release against the unchanged mirror and
   qualify that combination. Preserve prior engine assets for rollback.
2. Resolve existing stored selections to the qualified successor without changing
   those stored IDs, visible labels, snapshot dates, or choice count.
3. Verify shared-output identity, collaborator consistency, compiler retirement,
   and all profile-bound cache invalidation. Do not hot-swap a running worker's
   binary or restore an old build's heap checkpoint under new code.
4. Verify rollback of profile resolution while keeping stored selections intact
   and old immutable assets available. Rollback needs no mirror replacement.

CorTeX is one consumer of this contract. Its own repository owns its profile
catalog, successor mapping, application tests, and deployment procedure. A
WasmTex release can be published while a consuming application's tested PR
remains unmerged; SDK publication alone does not deploy that application.

## Maintainable implementation

Prefer runtime/data, build flags, and interposition when they solve the measured
problem. When an internal change is needed, keep it small and track it as a
build-applied patch with explicit assumptions and tests; upstream drift must
fail loudly. Follow [upstream maintenance](texlive-upgrade.md#upstream-maintenance-interpose-dont-patch)
and retain the same host-independent execution and client-first defaults in the
[execution model](execution-model.md). This policy adds compatibility requirements;
it does not replace the existing release or source-provenance requirements.
