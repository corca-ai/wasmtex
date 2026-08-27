# WasmTex Agent Guide

Browser-based LaTeX editor with real-time PDF preview.

> **IMPORTANT**: Before performing any task or modification, you MUST read the relevant documents listed below to ensure alignment with the project's architecture, conventions, and standards.

## Core Mission

To provide a high-performance, **embeddable LaTeX component** for academic platforms and collaboration tools.

## Documentation Index

- **[System Architecture](docs/architecture.md)**: Overview of the SDK structure, core components (VFS, LSP, Engines), and tech stack. Read this to understand how different modules interact.
- **[Execution Model (Client/Server Hybrid)](docs/execution-model.md)**: The strategic architecture — one host-agnostic deterministic engine running identically on client and server, with an integrator-chosen boundary (client-first default). Read this before any work touching the client/server split, headless/UI separation, pluggable backends, or cross-host verification.
- **[Integration Guide](docs/howto.md)**: Step-by-step instructions on embedding the editor, supporting BibTeX, using Headless mode, and the server-side paths — Node compilation (`installNodeWorkerHost` via `wasmtex/node`) and server backends (BibTeX/Biber/xindy offload via the `backends` option). Essential for usage-related tasks.
- **[API Reference](docs/api.md)**: Comprehensive documentation of the `WasmTex` class methods, constructor options, and event system. Refer to this for any API changes or additions.
- **[Bibliography Backends](docs/bibliography.md)**: BibTeX vs biblatex/Biber detection and the pluggable backend interface.
- **[Warmup / Preload](docs/warmup.md)**: Eliminating first-compile cold start by pre-fetching TeX Live files.
- **[WASM & TeX Live](docs/engine.md)**: Overview of the compilation engine and CDN.
- **[TeX Live Internals & Upgrade](docs/texlive-upgrade.md)**: Deep dive into the kpathsea fallback, immutable R2 structure, the [upstream-maintenance philosophy (interpose, don't patch)](docs/texlive-upgrade.md#upstream-maintenance-interpose-dont-patch), and the guide for upgrading to a new TeX Live year.
- **[TeX Live mirror operations](docs/texlive-mirror-operations.md)**: Provider-neutral publication, R2 custom-domain configuration, immutable snapshots, verification, rollback, and origin retirement.
- **[Development Guide](docs/develop.md)**: Essential guide for contributors, covering environment setup, CLI commands, and testing strategies (Vitest/Playwright).
- **[Licensing](docs/licensing.md)**: License scope, engine/CDN release gates, and third-party compliance requirements.
- **[Corresponding Source](docs/corresponding-source.md)**: Receipt-bound source archive creation, verification, and clean-builder release requirements.
- **[Proprietary Integration](docs/proprietary-integration.md)**: Required SDK/engine boundary for closed-source host applications.

---
*For documentation maintenance rules, see [docs/metadoc.md](docs/metadoc.md).*
