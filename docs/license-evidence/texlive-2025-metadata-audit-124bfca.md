# TeX Live 2025 metadata audit (`124bfca`)

This record inventories the package-license and flattened-name review work for the
current TeX Live 2025 mirror rules. It is not release clearance. It uses only the
digest-pinned TLPDB, so notice-file existence and candidate file bytes still require
the full archive audit.

> Historical note (2026-08-27): the counts below describe the audit policy at
> commit `124bfca`. The release policy now accepts a pinned TeX Live
> `catalogue-license` declaration as the upstream review for unchanged package bytes.
> Local review remains required for the 73 packages without that declaration and for
> differing flattened-name collisions. Packages without a filename-matched notice
> are reported but are not rejected merely because no universal notice requirement
> exists.

## Fixed inputs

| Input | Value |
| --- | --- |
| WasmTex audit tool commit | `124bfca4b9ce66d8cb8e2c8aa1f258a6c8656e04` |
| TeX Live metadata archive | `texlive-20250308-extra.tar.xz` |
| Metadata archive SHA-512 | `a1320469be140c4c0b00a0e307a203114061087a51f6fbcff9c255a0a3ba9cb3abfccc6edb6ad1388e32072f532837ca055eeead131eccce56f785705a0c9035` |
| TLPDB archive member | `texlive-20250308-extra/tlpkg/texlive.tlpdb` |
| Extracted TLPDB SHA-256 | `ae3d202a8e2f8ce3b4e770db626d1d2707798ead8ebb713ad8e5aa14ede77fee` |
| Audit date | 2026-07-21 |

The input URL and archive digests are pinned in
[`scripts/texlive-mirror-2025.json`](../../scripts/texlive-mirror-2025.json).

## Reproduction

```bash
npm run audit:texlive-provenance -- \
  --metadata-only \
  --tlpdb <extracted-texlive.tlpdb> \
  --output <audit.json>
```

The generated JSON was 2,768,711 bytes with SHA-256
`09e4476063eafa805dacadc9145be75fa824cb4d3f306fce2aa2e054c4ab4bf8`.
It is generated evidence and is not tracked; the command above reproduces it from
the pinned input. Exit status 2 is intentional while package metadata errors remain.
No WebAssembly compilation was performed for this audit.

## Results

| Item | Count |
| --- | ---: |
| Flattened mirror keys | 155,983 |
| Candidate source-file mappings | 156,116 |
| Owning packages in the current mirror rules | 4,110 |
| Packages requiring human review | 4,110 |
| Packages without reviewed overrides | 4,110 |
| Packages without catalogue license metadata | 73 |
| Packages without detected notice-file candidates | 374 |
| Flattened-name collision candidates | 60 |
| Collisions requiring content inspection | 60 |
| Deduplicated metadata errors | 73 |

All current package overrides are intentionally empty, so all 4,110 packages remain
unreviewed. The 374 notice count is based on a filename heuristic over TLPDB-owned
files; it does not prove that the other packages have sufficient notice evidence.

The 73 packages without TLPDB `catalogue-license` metadata are:

```text
00texlive.image
afm2pl
c90
cmexb
context-companion-fonts
context-legacy
cweb-old
euxm
garuda-c90
glyphlist
gustlib
hyphen-afrikaans
hyphen-albanian
hyphen-ancientgreek
hyphen-arabic
hyphen-armenian
hyphen-base
hyphen-belarusian
hyphen-bulgarian
hyphen-catalan
hyphen-chinese
hyphen-churchslavonic
hyphen-coptic
hyphen-czech
hyphen-english
hyphen-esperanto
hyphen-estonian
hyphen-ethiopic
hyphen-farsi
hyphen-french
hyphen-friulan
hyphen-galician
hyphen-georgian
hyphen-german
hyphen-hebrew
hyphen-indic
hyphen-indonesian
hyphen-interlingua
hyphen-irish
hyphen-kurmanji
hyphen-latvian
hyphen-lithuanian
hyphen-macedonian
hyphen-mongolian
hyphen-norwegian
hyphen-occitan
hyphen-piedmontese
hyphen-portuguese
hyphen-romanian
hyphen-romansh
hyphen-russian
hyphen-sanskrit
hyphen-slovak
hyphen-slovenian
hyphen-swedish
hyphen-thai
hyphen-turkmen
hyphen-ukrainian
hyphen-uppersorbian
hyphen-vietnamese
hyphen-welsh
jmn
kluwer
latexconfig
mflua
mptopdf
norasi-c90
otibet
pdfwin
qpxqtx
texlive-scripts
ttfutils
xetexconfig
```

Representative collision candidates include the four Latin Modern map names,
`pdftex/26/README` with seven source paths, `pdftex/26/doc.lua` with six source
paths, the three `fithesis-*.def` keys with twelve source paths each, and several
PGF graph-drawing Lua basenames. Metadata alone cannot determine whether these
files are byte-identical or which differing file is correct for the flattened key.

## Required follow-up

1. Download and verify the pinned `texmf` archive, then run the full-byte audit with
   `--texmf-dist` instead of `--metadata-only`.
2. Record identical-content collisions automatically and add a reviewed exact-path
   selection and rationale for each differing-content collision.
3. Review the license evidence for each retained package that lacks pinned TLPDB
   `catalogue-license` metadata and add an explicit evidenced override.
4. If reviewing the current broad mirror is not operationally feasible, define and
   compatibility-test a product package allowlist before reducing scope. Do not
   silently drop packages merely to reduce review counts.
5. Generate the byte-level provenance manifest, compare it to the CDN objects, and
   retain the `texlive-provenance` release blocker until the strict gate passes.
