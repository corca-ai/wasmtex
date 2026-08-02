# Security Policy

WasmTex compiles untrusted LaTeX **in the browser** (and optionally under Node), streams
TeX Live packages from a CDN, and is embedded as a component inside host applications. We
take security reports seriously and appreciate coordinated disclosure.

## Supported versions

WasmTex is pre-1.0 and ships from `main` (consumers install `github:corca-ai/wasmtex#main`;
the committed `lib/` bundle is the released artifact). Fixes land on `main`; there are no
maintained back-port branches yet.

| Version | Supported |
|---------|-----------|
| `main` (latest `lib/`) | ✅ |
| Older commits / pinned refs | ⚠️ Best-effort — please reproduce on latest `main` first |

## Reporting a vulnerability

**Please do not open a public issue, PR, or discussion for a security vulnerability.**

Report it privately through GitHub's private vulnerability reporting:

1. Go to the repository's **Security** tab →
   [**Report a vulnerability**](https://github.com/corca-ai/wasmtex/security/advisories/new).
2. Describe the issue with enough detail to reproduce it.

Please include, where possible:

- A description of the vulnerability and its impact.
- Affected component (editor/SDK, headless compiler, Node host, LSP, an engine, the
  CDN/asset-sync path, or the build/release tooling).
- A minimal reproduction — a LaTeX snippet, code sample, or steps. Note which engine
  (`pdflatex` / `xelatex` / `lualatex`) and host (browser vs. Node) is involved.
- Environment: browser + version, or Node version and OS.
- Any known mitigation or suggested fix.

### What to expect

As a pre-1.0, community-maintained project we respond on a best-effort basis. We aim to
acknowledge a report within a few business days, keep you updated as we investigate, and
credit you in the advisory once a fix ships (unless you prefer to stay anonymous). Please
give us reasonable time to release a fix before any public disclosure.

## Scope & threat model

WasmTex runs a full TeX engine on potentially untrusted input. Some notes on the trust
boundary to help you calibrate reports:

**In scope** — issues such as:

- Escapes from the WASM sandbox or the compiler's virtual filesystem (reading/writing host
  files outside the intended VFS).
- The engine reaching the network or executing shell commands (shell-escape / `\write18`
  should be disabled — a bypass is a vulnerability).
- Integrity gaps in the engine-asset supply chain (e.g. accepting CDN assets that fail
  SHA-256 verification, cache-poisoning the persistent asset cache).
- XSS, prototype pollution, or code injection reachable through document content, SyncTeX
  data, LSP messages, or SDK options when used as documented.
- Bypasses of runtime-completion record/size limits, profile/revision checks, or stale
  invalidation that let hostile TeX or JSON-RPC retain unbounded data or consume
  cross-project evidence.
- Denial of service that meaningfully exceeds "a pathological document is slow to compile."

**Generally out of scope:**

- A malicious document consuming CPU/memory while compiling in the caller's own tab/worker
  (compilation of attacker-controlled LaTeX is expected to be resource-bounded by the
  integrator; treat untrusted input accordingly — see below).
- Vulnerabilities in upstream TeX Live packages, Monaco, PDF.js, or other dependencies —
  please report those upstream (tell us too if WasmTex amplifies the impact).
- Missing hardening headers on the demo site (`corca-ai.github.io/wasmtex`), which is a
  showcase, not a production deployment.

## Notes for integrators

If you embed WasmTex to compile untrusted, user-supplied LaTeX:

- Run compilation in an isolated worker/origin and apply a strict Content-Security-Policy.
- Bound compute (timeouts, memory) and treat compiler output as untrusted data.
- Treat completion snapshots as untrusted compiler output. Use the public update API,
  which validates schema, record/byte ceilings, compile profile, and project revision;
  do not inject snapshot fields directly into an index.
- Pin and verify engine assets via the generated asset manifest rather than trusting an
  arbitrary CDN origin (see [docs/warmup.md](docs/warmup.md) and
  [docs/engine.md](docs/engine.md)).

Thank you for helping keep WasmTex and its users safe.
