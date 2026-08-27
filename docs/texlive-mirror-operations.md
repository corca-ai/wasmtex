# TeX Live mirror operations

WasmTex publishes immutable TeX Live snapshots to Cloudflare R2 through the
public custom domain `https://texlive.corca.ai`. Mirror identity remains derived from object bytes and
does not contain either the bucket or public hostname.

## Destination contract

All publication, audit, bloom, and font-database tools use the same variables:

| variable | meaning |
|---|---|
| `TEXLIVE_MIRROR_CONFIG` | pinned annual snapshot configuration |
| `TEXLIVE_MIRROR_OVERRIDES` | reviewed package ownership, licensing, and collision decisions for that snapshot |
| `TEXLIVE_OBJECT_BUCKET` | destination bucket |
| `TEXLIVE_OBJECT_ENDPOINT` | required R2 endpoint, `https://<account-id>.r2.cloudflarestorage.com` |
| `TEXLIVE_OBJECT_PREFIX` | optional prefix before the year/snapshot |
| `TEXLIVE_R2_PROFILE` | optional local CLI profile containing R2 credentials |
| `TEXLIVE_DEPLOYED_URL` | public base URL used for byte verification |
| `TEXLIVE_MIRROR_ROOT` | optional verified local release root used to generate bloom data without listing a remote store |

The publication tools use the AWS CLI only as a client for R2's compatibility
endpoint. They reject a missing or non-R2 endpoint. The selected profile uses
region `auto`. Publisher credentials need object
read/write for the TeX Live bucket; bucket/DNS/CORS administration uses a
separate administrative credential.

For a release identified by `2025-0123456789abcdef`, set the prefix to the
immutable snapshot root, for example `snapshots/2025-0123456789abcdef`. Never
publish compiler inputs through a mutable `latest` object path.

```bash
export TEXLIVE_OBJECT_BUCKET=corca-texlive-production
export TEXLIVE_OBJECT_ENDPOINT=https://ACCOUNT_ID.r2.cloudflarestorage.com
export TEXLIVE_OBJECT_PREFIX=snapshots/2025-0123456789abcdef
export TEXLIVE_DEPLOYED_URL=https://texlive.corca.ai/snapshots/2025-0123456789abcdef/2025/
export TEXLIVE_RUNTIME_ASSETS_DIR=/verified/runtime-assets/2025
./scripts/sync-texlive-mirror.sh --upload
node scripts/audit-mirror.mjs --year 2025 --check
```

## Frozen tlnet snapshots

The initial annual DVD state uses the two official release archives. A dated
repository state or `tlnet-final` instead uses `sourceType=tlnet-repository`.
Materialize it before generation so the official installer verifies every
package container against the pinned, frozen TLPDB:

```bash
export TEXLIVE_MIRROR_CONFIG=$PWD/scripts/texlive-mirror-2025-final.json
# TEXLIVE_REPOSITORY_URL may select a byte-identical historic mirror when the
# canonical archive is slow; the installer and TLPDB digests still must match.
export TEXLIVE_REPOSITORY_URL=https://mirrors.nju.edu.cn/tex-historic/systems/texlive/2025/tlnet-final
export WORK_DIR=/verified/texlive-2025-final
./scripts/prepare-tlnet-snapshot.sh
```

The preparation installs source and documentation as evidence as well as runtime
files and emits a materialization receipt for the exact installed tree. Export the
printed `TEXMF_DIST`, `TEXLIVE_TLPDB`, and `TEXLIVE_MATERIALIZATION_RECEIPT`
values together when running the mirror sync; generation recomputes the tree hash
and refuses a missing or stale receipt. Mirror generation still emits only the
supported flattened runtime surface.
The provenance manifest records the canonical frozen repository, installer digest,
pinned TLPDB digest, every selected source path, and the byte-derived mirror identity.

Generate snapshot-coupled runtime data from that verified local release before
publication. `XETEX_FONTLIST_OUTPUT`, `LUAOTFLOAD_NAMES_OUTPUT`, and
`TEXLIVE_BLOOM_OUTPUT` let an isolated release workspace receive the outputs
without modifying the checkout. Luaotfload DB generation normalizes its two
wall-clock fields and per-font mtimes; two runs over the same font bytes must
produce the same SHA-256.

After copying `icudt68l.dat`, copying the exact install's generated
`texmf-var/fonts/map/pdftex/updmap/pdftex.map` to `pdftex/11/pdftex.map`, and
generating the three other artifacts, run
`node scripts/snapshot-artifacts.mjs --release-root <release>` and repeat it
with `--check`. The resulting `snapshot-artifacts.json` binds their exact size
and SHA-256, plus the provenance hash, to the snapshot's mirror revision. The
core provenance checker continues to own the flattened upstream package files;
the artifact checker owns these five generated/runtime files. When that artifact
manifest is present, the provenance checker accepts its three `pdftex/` supplemental
files only after checking their declared size and digest; any other unrecorded
file still fails the exact-inventory gate.

## R2 serving configuration

Use separate production and non-production buckets. Attach
`texlive.corca.ai` to the production bucket as an R2 custom domain; do not
enable `r2.dev`. Configure bucket CORS for `GET` and `HEAD` from the production
and staging CorTeX origins plus the exact local qualification origins
`http://localhost:5173`, `http://127.0.0.1:5173`, `http://localhost:6001`, and
`http://127.0.0.1:6001`. The local origins are required because format extraction
uses Vite's development port and the browser qualification corpus uses its isolated
test port. Allow `Range`; expose `ETag`, `Content-Length`, `Content-Range`, and
`Accept-Ranges`; and set a suitable preflight age. Objects beneath immutable
snapshot prefixes use `Cache-Control: public, max-age=31536000, immutable`.
Do not cache missing-object responses across publication: verify representative
404-to-200 paths or purge the affected negative cache before qualification.

## Publication and verification

1. Generate or recover the exact annual release and its provenance.
2. Publish it to a new immutable R2 prefix. The tool refuses an existing compiler-input prefix.
3. `sync-texlive-mirror.sh` runs `verify-object-mirror.mjs` after upload to compare
   every key, size, and downloaded SHA-256 and reject stale objects. Also run
   `audit-mirror.mjs --check` through the R2 endpoint for format/package coverage.
4. Fetch representative format, font, catalog, semantic, bloom, and provenance
   objects through `texlive.corca.ai`; check CORS, `ETag`, and immutable cache
   headers. Run headless and browser engine smokes with that exact public URL.
5. Change CorTeX profile locators only after the byte identity matches.
6. Recovery republishes the same manifest-bound bytes to a new R2 prefix and
   updates only the physical locator; it never changes `mirrorRevision` merely
   because the host moved.

The publication command refuses a non-empty compiler-input prefix unless the
operator explicitly requests replacement. Catalog-only publication remains
separate and cannot replace mirror bytes.
