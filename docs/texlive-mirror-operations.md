# TeX Live mirror operations

WasmTex publishes immutable TeX Live snapshots to an S3-compatible object
store. The production migration target is Cloudflare R2 and the public custom domain
`https://texlive.corca.ai`; after qualification and cutover, mirror identity remains derived from object bytes and
does not contain either the bucket or public hostname.

## Destination contract

All publication, audit, bloom, and font-database tools use the same variables:

| variable | meaning |
|---|---|
| `TEXLIVE_OBJECT_BUCKET` | destination bucket |
| `TEXLIVE_OBJECT_ENDPOINT` | S3-compatible endpoint; R2 uses `https://<account-id>.r2.cloudflarestorage.com` |
| `TEXLIVE_OBJECT_PREFIX` | optional prefix before the year/snapshot |
| `TEXLIVE_OBJECT_PROFILE` | optional local AWS CLI profile |
| `TEXLIVE_DEPLOYED_URL` | public base URL used for byte verification |

The AWS CLI is only the S3-protocol client. R2 calls must set the endpoint and
use region `auto` in the selected profile. Publisher credentials need object
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

The legacy `S3_BUCKET` variable and `sync-texlive-s3.sh` entrypoint remain as
compatibility aliases. New automation uses the provider-neutral names.

## R2 serving configuration

Use separate production and non-production buckets. Attach
`texlive.corca.ai` to the production bucket as an R2 custom domain; do not
enable `r2.dev`. Configure bucket CORS for `GET` and `HEAD` from CorTeX origins,
expose `ETag`, and set a suitable preflight age. Objects beneath immutable
snapshot prefixes use `Cache-Control: public, max-age=31536000, immutable`.
Do not cache missing-object responses across publication: verify representative
404-to-200 paths or purge the affected negative cache before qualification.

## Migration and verification

1. Generate or recover the exact current 2025 release and its provenance.
2. Publish it to a new immutable R2 prefix. Do not use `--replace-existing` for
   an already qualified prefix.
3. `sync-texlive-mirror.sh` runs `verify-object-mirror.mjs` after upload to compare
   every key, size, and downloaded SHA-256 and reject stale objects. Also run
   `audit-mirror.mjs --check` through the R2 endpoint for format/package coverage.
4. Fetch representative format, font, catalog, semantic, bloom, and provenance
   objects through `texlive.corca.ai`; check CORS, `ETag`, and immutable cache
   headers. Run headless and browser engine smokes with that exact public URL.
5. Change CorTeX profile locators only after the byte identity matches. Keep the
   old CloudFront origin during the rollback window.
6. Retire CloudFront/S3 only after every qualified locator uses R2 and rollback
   evidence is recorded. Recovery republishes the same manifest-bound bytes to
   a new origin; it never changes `mirrorRevision` merely because the host moved.

The publication command refuses a non-empty compiler-input prefix unless the
operator explicitly requests replacement. Catalog-only publication remains
separate and cannot replace mirror bytes.
