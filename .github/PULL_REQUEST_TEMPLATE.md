<!--
Thanks for contributing to WasmTex! Please read CONTRIBUTING.md first.
Keep PRs focused — unrelated changes belong in separate PRs.
-->

## Summary

<!-- What does this PR do, and why? -->

## Related issue

<!-- e.g. "Closes #123". If there's no issue, briefly explain the motivation above. -->

## Type of change

- [ ] Bug fix (non-breaking change that fixes an issue)
- [ ] New feature (non-breaking change that adds functionality)
- [ ] Breaking change (fix or feature that changes existing behavior/API)
- [ ] Docs only
- [ ] Build / CI / tooling
- [ ] Compliance / licensing

## Checklist

- [ ] `npm run check` (typecheck) passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes; I added/updated tests for my change
- [ ] If I changed `src/` in a way that affects built output, I ran `npm run build:lib`
      and committed the updated `lib/` in this PR
- [ ] I updated the relevant docs in `docs/` (and followed `docs/metadoc.md`)
- [ ] I added a `CHANGELOG.md` entry under **Unreleased** for user-facing changes
- [ ] Golden output: if compiled output changed intentionally, I refreshed goldens
      (`npm run update:golden`) and reviewed the diff — otherwise N/A
- [ ] If this touches engine assets / `public/` / `LICENSES/` / release tooling, the
      compliance checks still pass (see `docs/licensing.md`) — otherwise N/A

## Notes for reviewers

<!-- Anything reviewers should focus on, trade-offs, follow-ups, screenshots, etc. -->
