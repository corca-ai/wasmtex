# dvipdfmx correctness patches

`missing-sfd.patch` fixes [#133](https://github.com/corca-ai/wasmtex/issues/133):
`pdf_insert_fontmap_record` released `sfd_name` before formatting its missing-file
warning. Emit the warning while its filename is alive, then perform the existing
cleanup. This intentionally corrects an existing diagnostic; it is a separate
correctness change from the [font-map optimization](https://github.com/corca-ai/wasmtex/pull/132).
Source pins, map parsing, successful outputs, formats and mirror bytes stay unchanged.

The patch applies to both pinned annual sources and fails on context drift. It is
an adaptation of GPL-2.0-or-later upstream engine code, outside the MIT SDK package;
include it and the build scripts in the engine's corresponding-source unit.

Run `python3 scripts/test-dvipdfmx-missing-sfd.py --source <texk/dvipdfm-x> --sanitize`.
The runner uses exact upstream function bodies, record declarations and table
implementation. Only the SFD lookup boundary is substituted with an absent-file
response; the actual insertion/name allocation/free/warning path is executed.
ASan must reproduce the upstream use-after-free, and the fixed variant must print
the exact filename and survive repeated failure, valid insertion and teardown.
Full browser conversion additionally checks real SFD resolution and worker reuse.

Manual `wasm-xetex.yml` dispatch with `dvipdfmx_only: true` uses the pinned
`Dockerfile.dvipdfmx` to build diagnostic assets without regenerating XeTeX or
formats. Its assets carry revision/hash evidence and are not release receipts.
Normal releases still use the full XeTeX family build and source-release gates.
