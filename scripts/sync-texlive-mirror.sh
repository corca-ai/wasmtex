#!/usr/bin/env bash
# Build a provenance-bound TeX Live mirror and optionally publish it to any
# S3-compatible object store. Cloudflare R2 uses region `auto` and an account
# endpoint such as https://<account-id>.r2.cloudflarestorage.com.
export TEXLIVE_REQUIRE_IMMUTABLE=true
exec "$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)/sync-texlive-s3.sh" "$@"
