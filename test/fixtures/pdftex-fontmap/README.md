# Rejected pdfTeX font-map experiment

`evidence-20260912.tar.gz` retains the non-adopted single-probe candidate,
source-build inputs, native differential, raw paired reports, fixtures,
comparison script and hashes. The [decision](../../../docs/pdftex-fontmap-experiment.md)
records scope, measured gains and unperformed release gates.

Extract into an empty directory, verify `SHA256SUMS`, and run
`python3 compare.py`. Its 60 compile pairs must preserve PDFs, SyncTeX/auxiliary
files, diagnostics, logs, dependencies, requests and unchanged assets. The
archive README describes rebuilding and rerunning; the native runner requires
the exact upstream source files. Mirror payloads and candidate WASM are not
included. Upstream-derived engine patches retain pdfTeX's GPL-covered scope;
this archive is evidence and is never an active build input or release asset.
