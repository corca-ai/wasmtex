# TeX Live 2026 snapshot lifecycle

WasmTex publishes immutable package snapshots. A compiler always receives an
exact `mirrorRevision`; it never reads a mutable `/latest/` package path.

## Published snapshots

| Name | Upstream state | Mirror revision | Public package root |
| --- | --- | --- | --- |
| Initial | TeX Live 2026 release archives dated 2026-03-01 | `2026-b4f6befbe7732169` | `https://texlive.corca.ai/snapshots/2026-b4f6befbe7732169/2026/` |
| 2026-08-26 | Frozen `tlnet-archive` repository | `2026-ba38749b8714505a` | `https://texlive.corca.ai/snapshots/2026-ba38749b8714505a/2026/` |

The initial snapshot contains 164,849 objects. The dated snapshot contains
168,942 objects. Exact object inventories were checked by key, byte length, and
SHA-256 after R2 publication. Their provenance SHA-256 values are respectively
`e3de2b970525f1a39e5d97da4ce1c3bbee4c16ecc78b9cc6fe1131c3020f5307`
and `7c5ef0a46b6a52cd8aa4e4ad2256eb58d6bb2062c45dfa43e48def1dfa9faf00`.

CorTeX may expose a logical `2026-latest` discovery profile, but that profile is
only an application-level pointer to one qualified immutable profile. Moving it
does not change either package prefix. Existing projects retain their exact
profile until a user changes it.

## Finalize after TeX Live 2027 releases

The 2026 `tlnet-final` repository does not exist until the TeX Live project
archives the year after the 2027 release. Complete these steps only then:

1. Copy `scripts/texlive-mirror-2025-final.json` to an annual 2026 final config.
   Record the official historic `systems/texlive/2026/tlnet-final` repository,
   installer SHA-512, and TLPDB SHA-256; never infer or predeclare their values.
2. Materialize the repository with `scripts/prepare-tlnet-snapshot.sh`. Preserve
   and verify the emitted materialization receipt when generating provenance.
3. Generate all flattened files and snapshot-coupled artifacts, then compare the
   byte-derived mirror revision with every existing 2026 revision. Reuse an
   existing immutable prefix only when the exact inventory is identical;
   otherwise publish and verify a new prefix.
4. Build all six engine families against that exact mirror identity. Run the
   browser golden corpus, Node/browser parity, and representative pdfLaTeX,
   XeLaTeX, and LuaLaTeX smokes.
5. Add the final exact profile to `scripts/texlive-profiles-2026.json`. Move the
   logical `2026-latest` discovery pointer to it only after CorTeX qualification.
   From then on, the discovery pointer is permanently frozen at `tlnet-final`.

Additional mid-cycle snapshots require a documented security or severe
compatibility reason. They follow the same immutable publication and qualification
procedure and do not silently move existing projects.
