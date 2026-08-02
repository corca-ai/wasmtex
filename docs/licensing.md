# Licensing and Release Compliance

This document records the licensing policy WasmTex adopted, why that policy is
compatible with every component the engines link, and what was done to comply —
with pointers to the machine-checkable evidence.

## The policy

WasmTex uses a split licensing model:

- original SDK, UI, LSP, build glue, and documentation: MIT;
- each engine release unit (worker + Emscripten JavaScript + WASM + formats):
  the terms of the complete linked combination, per family below;
- TeX Live packages, fonts, Lua files, ICU data, and compiled formats: the
  terms of their individual inputs.

The [`THIRD_PARTY_NOTICES.md` inventory](../THIRD_PARTY_NOTICES.md) identifies
materials that the root [`LICENSE`](../LICENSE) does not relicense.

### Why MIT for the SDK

The governing product goal is not to preserve MIT for its own sake. It is to
publish WasmTex, let integrating applications stay closed-source, and comply
with every license on both sides of the boundary.

The reference integration imports the SDK's headless compiler, LSP, Monaco
adapter, warmup runtime, SyncTeX types, and other public TypeScript APIs into
its client build. It does not consume the SDK solely through an out-of-process
engine protocol. Based on that concrete coupling, the WasmTex-authored host SDK
remains under MIT: a permissive SDK license lets an integrating application
keep its original code private while the separately delivered engine workers
satisfy their own copyleft terms. MIT is the selected implementation for this
boundary, not an immutable project requirement.

Do not relicense the whole repository under GPL merely because it builds or
launches GPL TeX engines. Doing so while integrators directly bundle the SDK
would work against the closed-source-integration goal. A future switch to GPL
for host-facing code requires first moving integrators to an independent
engine protocol only, or providing a separate permissive/commercial license
for the host SDK.

This means `package.json` correctly says `MIT` for the installable SDK because
its `files` list excludes `public/` and the engine binaries. A product must not
use that metadata to describe a separately hosted engine directory or TeX Live
mirror. For the boundary that lets a closed-source application use WasmTex, see
the [proprietary integration guide](proprietary-integration.md).

### Per-unit terms

| Path or release unit | License treatment |
| --- | --- |
| `src/`, WasmTex-authored documentation and build glue | MIT unless the file says otherwise. |
| `src/synctex/` port | MIT SDK distribution plus the retained upstream SyncTeX permission and non-endorsement notice. |
| `lib/` | Generated form of the corresponding `src/` code; ship the same notices as the source package. |
| Engine Worker/glue/WASM release | The terms of the complete linked engine unit, including GPL and linked-component notices; never described by npm's MIT metadata alone. |
| TeX Live packages, fonts and Lua files | Their upstream terms as part of the separately operated full TeX Live distribution. Generated engine formats and ICU data remain part of the exact engine-release audit. |
| `LICENSES/` and third-party notices | Preserved license evidence; inclusion does not relicense the covered component. |

The [engine component inventory](../scripts/engine-components-2025.json) enforces
this engine family classification:

| Family | Combined distribution terms |
| --- | --- |
| pdfTeX | `GPL-2.0-only` plus linked-component notices |
| XeTeX | `GPL-2.0-only AND LicenseRef-XeTeX` plus linked-component notices |
| dvipdfmx | `GPL-2.0-or-later` plus linked-component notices |
| LuaHBTeX | `GPL-2.0-only` plus MIT (WTPDF/SHA-2) and embedded-library notices |
| BibTeX | `LicenseRef-BibTeX-Web2C-Notices AND LGPL-2.1-or-later` |
| BibTeX8 | `GPL-2.0-or-later` plus linked-component notices |
| makeindex | `LicenseRef-MakeIndex-Distribution-Notice AND LGPL-2.1-or-later` |
| `.fmt`/`.fmt.gz`, ICU data | Terms of their recorded generation inputs; ICU 68.2 license for the data file |

## Why the combination is compatible

Each engine binary is one linked program, so its distribution terms must be
satisfiable by every statically linked component simultaneously. The actual
linked set is not assumed: the
[release link inventory](license-evidence/link-inventory-9f7c7d4.json) captures
81 static archives across 7 executables, and every archive is classified in
the component inventory, which CI re-checks fail-closed.

The reasoning, component class by component class:

- **Xpdf 4.04 (PDF parsing in pdfTeX, XeTeX, LuaHBTeX)** is offered under
  "GPL v2 or v3". Its GPLv2 alternative is **elected**, which forces the three
  combinations that contain it to `GPL-2.0-only` — GPLv2-only and GPLv3 code
  cannot be combined, so one coherent version must be chosen, and the TeX
  engines themselves (`GPL-2.0-or-later`) are satisfied by v2.
- **FreeType (XeTeX)** is offered under the FreeType License or GPLv2. The FTL
  carries a credit requirement the FSF regards as GPL-incompatible, so for the
  XeTeX combined unit **GPLv2 is elected** and the FTL is not used.
- **XeTeX's own license** is a permissive X11-style grant with a
  non-endorsement/naming clause (`LicenseRef-XeTeX`); it is GPL-compatible and
  its notice is carried alongside the GPL terms.
- **LGPL components** — kpathsea, Graphite2, TECkit (LGPL-2.1-or-later) and
  zziplib (LGPL-2.0-or-later) — may be combined into GPL-distributed programs.
  WasmTex does not rely on silently converting them to GPL: each keeps its
  selected LGPL terms, and the static-linking obligations are honored the
  strict way, by shipping the complete library source, local changes, build
  scripts, and a `RELINK.md` recipe so a recipient can substitute a modified
  library and relink (LGPL §6 "provide source" route). WasmTex does not claim
  that static linking erases the LGPL terms.
- **Permissive components** — Lua 5.3 (MIT), HarfBuzz (Old-MIT), zlib, libpng,
  ICU, the Emscripten runtime (MIT/NCSA/LLVM-exception/musl notices), and the
  WasmTex-authored WTPDF adapter and SHA-2 implementation (MIT) — are all
  GPL-compatible; their notices are preserved in the combined unit rather than
  being absorbed.
- **Notice-bearing TeX-lineage components** — BibTeX/web2c and makeindex carry
  their original permission notices; makeindex additionally requires a
  conspicuous statement of where source can be obtained and a disclosure that
  the port is modified, which the release carries.
- **Generated formats** are not engine code but compiled dumps of LPPL- and
  otherwise-licensed TeX inputs; their exact observed inputs are recorded per
  release (`license-evidence/format-inputs-*.json`) and they are distributed
  under those inputs' terms.

Two things the policy deliberately avoids: a per-file MIT label on anything in
an engine unit (npm metadata never describes engine directories), and any
component whose redistribution basis is unrecorded — the inventory check
rejects an archive it cannot classify.

## What was done to comply

The [license evidence index](license-evidence/README.md) lists the records that
bind each claim below.

### PDF parsing without `pplib`

XeTeX and LuaHBTeX parse PDFs through **WTPDF**, a WasmTex-authored MIT C ABI
over the GPL Xpdf 4.04 parser already present in TeX Live; the
[PDF backend implementation notes](../wasm-build/pdf-backend/README.md) describe the boundary.
`pplib` is excluded from every release unit: link maps and release bytes are
scanned for `libpplib`, the `pp*_` symbol families, and legacy SHA helpers,
and any match fails the build.

The implementation's independence is both enforced and evidenced:

- copying `ppapi.h`, pplib names, struct layouts, or implementation is
  prohibited; WTPDF's API deliberately differs in names, handle model, and
  ownership rules; and version control contains no pplib implementation
  source;
- compatibility is verified by black-box differentials against
  non-distributed pplib baseline builds, not by reference to pplib source:
  the [XeTeX extended differential](license-evidence/xetex-pdf-extended-differential-2d87107.md) records the
  geometry, visual, and extended corpora,
  the LuaHBTeX `pdfe`/`pdfscanner` API surface — types, string bytes and
  lexical form, dictionary order, raw/decoded streams, authentication,
  limits — is locked by the
  [LuaHBTeX API differential](license-evidence/luahbtex-pdfe-differential-923b196.md) as a build-gate fixture,
  and the [LuaHBTeX import differential](license-evidence/luahbtex-pdf-import-differential-2b58db3.md) covers
  package-level `graphicx`/`pdfpages`/TikZ import; all three match the baseline
  byte- or pixel-exactly on clean inputs;
- the two behavioral differences are classified and approved with a recorded
  approver: Xpdf repairs damaged PDFs the baseline rejects, and the XeTeX
  final link permutes symbol order across identical-input runs of the pinned
  toolchain — functionally equivalent and golden-verified. The
  [source archive evidence](license-evidence/corresponding-source-2025-3a630ec.md) verifies both differences;
- parser resource limits (input size, object depth, decoded bytes, adapter
  allocation), malformed-input failure, post-open authentication, and
  valgrind-verified memory release are tested on success and failure paths.

### Artifact traceability

Every release artifact is bound to a `BUILD-RECEIPT.<family>.json` recording
the WasmTex commit, TeX Live commit, Emscripten commit, digest-pinned build
image, and per-file SHA-256, and all family receipts must share one source
revision. A per-archive link inventory and an SPDX SBOM classify everything
the linker actually selected, as recorded in the
[engine release evidence](license-evidence/engine-release-2025-2b58db3.md) for that build.
Independent rebuilds reproduce the engine bytes, format dumps record their
observed inputs and known non-determinism, and version control carries no
engine binaries or formats at all.

### Complete corresponding source

A deterministic builder assembles the corresponding-source archive from the
release receipts: the WasmTex snapshot for every receipt revision, the pinned
TeX Live source with the unused `libs/pplib` tree removed, Emscripten source
at its pinned commit, hash-verified Emscripten port archives, Dockerfiles,
build scripts, glue, manifests, and `REBUILD.md`/`RELINK.md`. A checker
verifies the archive, the bundled TeX Live tree is diffed against an
independent clone of the pinned commit, and a clean `--no-cache --pull`
rebuild from the archive snapshot reproduces the release engine bytes, with
the approved XeTeX link-order permutation as the sole exception documented in
the [corresponding-source evidence](license-evidence/corresponding-source-2025-3a630ec.md)
and [corresponding-source guide](corresponding-source.md). Because that link is
reproducible but not bit-identical, the corresponding source is bound to the
distributed binaries by **source revision**, not by an exact content-hash
release ID: the checker requires the archive to bundle exactly the source
revision the deployed receipts name, and the archive is re-cut when the engines
are rebuilt from a new revision. The archive SHA-256 and its public HTTPS URL
are recorded in `LICENSE-MANIFEST.json#correspondingSource`.

### Notices and relink material

`LICENSES/` carries the current texts and notices for every recorded component
(GPL-2.0, GPL-3.0, LGPL variants, Xpdf, XeTeX, SyncTeX, makeindex, ICU,
Emscripten and its ports, Lua, musl, and the rest);
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) maps them to release
units. Generated Emscripten JavaScript retains its license output after the
build. The SyncTeX TypeScript port names its upstream author and points to the
retained permission and non-endorsement notice.

### Repository publication audit

The publication audit covers a secret scan over the full history and the
ignored-file-inclusive working tree (no leaks), a history audit (no binary or
archive blobs, no stray branches, tags, stashes, or LFS objects), and a review
of third-party-ported source headers, as recorded in the
[repository publication audit](license-evidence/repository-audit-3ec3290.md) for that revision.
The scans are re-run on the final pre-publication commit.

### Fail-closed automation

`npm run check:licenses` is the source-repository gate: it verifies the
SDK/package license boundary, pinned TeX Live commit, manifest links and
blocker consistency, required notices and evidence files, component-inventory
and link-inventory coherence, SPDX SBOM freshness, and the absence of tracked
engine binaries, formats, or a vendored `pplib`. Every engine workflow runs it;
public workflows additionally run the strict `--release` mode before uploading
artifacts or deploying Pages, and `scripts/sync-engine-assets.mjs` refuses an
asset set that is not `release-cleared`. Changing the label without resolving
every recorded blocker would make the metadata false — the tooling exists to
prevent exactly that.

## Engine release gate

Do not publish a versioned engine directory until all of the following are true:

1. Its manifest identifies the TeX Live commit, Emscripten version, component
   name, license expression or reference, notice path, corresponding-source
   location, and hashes for both binary and source artifacts. Every engine
   artifact set also carries a `BUILD-RECEIPT.<family>.json` that binds its
   exact bytes to the WasmTex Git commit, TeX Live commit, Emscripten commit,
   and digest-pinned build image. The final asset manifest rejects missing,
   overlapping, stale, or unclassified receipt coverage in release mode.
2. The corresponding-source archive contains the pinned TeX Live source,
   WasmTex worker/glue source, Dockerfiles, build scripts, and all local
   modifications used to produce the binary.
3. GPL-covered binaries are distributed with source in the same place or
   through another GPL-2.0-compliant method. Do not rely solely on a
   third-party upstream URL.
4. Statically linked kpathsea, Graphite2, TECkit, and zziplib keep their
   selected LGPL terms, with complete source and `RELINK.md` as described
   above.
5. The makeindex executable is accompanied by `LICENSES/MakeIndex.txt` and a
   conspicuous, working source-obtainment statement.
6. Generated Emscripten JavaScript retains its license output, and the complete
   third-party notice set accompanies the release.
7. Every linked component has an affirmative, recorded redistribution basis. A
   release containing XeTeX or LuaHBTeX must use the audited WTPDF/Xpdf build
   and reject any legacy `pplib`-linked artifact.
8. `node scripts/check-engine-license-inventory.mjs 2025` covers every archive
   in the release link maps exactly once and rejects missing notice files or an
   LGPL entry without its relink method.

The committed or locally downloaded files under `public/wasmtex/<version>/` are
development inputs, not evidence that the release gate has passed. A public
product must publish a release-specific manifest and source bundle for the
exact bytes it serves.

The Emscripten base is pinned by registry digest, not only by the mutable
`3.1.46` tag. `scripts/corresponding-source-2025.json` also pins the Emscripten
Git commit and the exact FreeType, ICU, libpng, and zlib port source archives
and hashes. Changing any Dockerfile to a different base makes
`npm run check:licenses` fail.

## Distribution surfaces

| Surface | Required legal material |
| --- | --- |
| Source repository | `LICENSE`, `THIRD_PARTY_NOTICES.md`, and `LICENSES/`. |
| npm/GitHub package | The same files, including the full SyncTeX notice. Peer notices are needed only when the peer code is copied into the package. |
| Standalone demo | The same files, plus notices for bundled Monaco Editor, PDF.js, and pdf-lib when present. |
| Engine asset host | Per-version notices and complete corresponding source for every distributed binary, including WasmTex glue and build scripts. |
| Full TeX Live mirror | Retain the official distribution's copying and package license material. It is operated separately from the engine release gate described here. |
| Generated completion catalogs | WasmTex-authored metadata derived from the exact mirror inventory; preserve each record's upstream package/source provenance and do not treat the catalog as relicensing the referenced TeX Live file. |
| Semantic overrides and extracted shards | Static declarations, including color names/models derived from selected xcolor `.def` files, retain exact TeX Live source paths; curated activation/typing overrides are MIT WasmTex-authored data. Observed/inferred records remain labeled. External completion corpora require separate file-level provenance and license approval. |
| ICU data | Retain the ICU 68.2 license bundle and exact source/version evidence. |

Serving JavaScript, WebAssembly, formats, packages, fonts, or data to a browser
is a distribution of those files. Running the same engine only on
infrastructure operated by the service provider is not a browser distribution;
distributing an on-premises image or appliance is distribution again.

## TeX Live CDN scope

The production TeX Live 2025 CDN is treated as a separately operated mirror of
the full official distribution. Its package-by-package manual review, per-file
provenance overrides, and CDN object comparison are not prerequisites for
clearing a WasmTex engine release. Keep the official TeX Live copying
information and the license/source material shipped with that distribution.

The provenance scripts in this repository remain useful integrity and
collision-audit tools for a transformed or flattened mirror, but their
`provenance-reviewed` state is not part of `LICENSE-MANIFEST.json` and does not
determine whether engine artifacts are `release-cleared`. If a future
deployment selects, modifies, or repackages TeX Live files instead of mirroring
the full distribution, review that distribution as a separate project before
publishing it.

Completion catalogs are generated only from that deployment's final provenance
manifest. They contain file/package identity, hashes, selected source paths,
collision decisions, and optional CTAN documentation links; CTAN is enrichment,
not a runtime availability or licensing authority. Do not import third-party
completion corpora into these shards without a separate source and license review.

Semantic extraction reads the mirrored package source already covered by that
package's upstream license. Option-gated color records are derived from the exact
selected `dvipsnam.def`, `svgnam.def`, and `x11nam.def` bytes and keep those paths as
provenance; the generated metadata does not copy package
documentation or relicense the package. The checked-in
`tex-semantic-overrides-<year>.json` is original MIT metadata and names its source
document only as review evidence. The release gate verifies that the override file
records MIT and that the required high-value scopes are present. CWL or another
third-party completion dataset must not be blended into this file.

This scope decision does not remove TeX Live source used to compile the engines
from the complete corresponding source. It also does not remove generated
`.fmt` inputs or ICU 68.2 data from the exact engine-release inventory.

## Updating dependencies

When bumping TeX Live, Emscripten, ICU, or a peer dependency:

1. compare the exact upstream license and notice files;
2. update `THIRD_PARTY_NOTICES.md` and `LICENSES/`;
3. regenerate engine build receipts, formats, and corresponding-source
   metadata;
4. verify that packaged and deployed outputs contain the legal files; and
5. record any newly linked library rather than assuming it inherits another
   component's license.
