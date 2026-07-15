# Remaining work

Status snapshot: 15 July 2026, immediately after `edcbe61` merged the usage documentation and check library.

This is the continuation checklist for Git Hooked. It records work that is genuinely still open so a future session does not repeat completed implementation. The earlier [example projects and guided setup plan](EXAMPLE_PROJECTS_AND_GUIDES_PLAN.md) remains useful design history; Phases A–C of that plan are complete.

## Current baseline — do not redo

- `@githooked/cli` version `0.1.0` is published on npm with the `latest` tag.
- `main` passes the complete CI matrix on Ubuntu, macOS, and Windows, plus the Ubuntu hook-manager integration suite.
- The deterministic example harness has six fixtures, and four replayable example repositories are public under the Git Hooked organization.
- Guided security setup, proposal isolation, curated guide packs, command-check trust, lifecycle commands, review caching, and the explicit `fix` workflow are implemented.
- The built-in library contains six checks. Five curated packs contain seventeen additional semantic checks.
- The [usage guide](https://githooked.github.io/githooked/docs/) and [check library](https://githooked.github.io/githooked/library/) are live on GitHub Pages.
- The web catalog has a drift test against the runtime built-in registry, default hooks, and guide-pack manifests.
- There were no open product issues or pull requests before this handoff document was created.

## P0 — release and documentation hygiene

### Reconcile the `0.1.0` release record

- [ ] Confirm that the current `0.1.0` npm artifact was built from the intended source commit.
- [ ] Create the missing `v0.1.0` Git tag and GitHub release with concise release notes. Do not republish the existing npm version.
- [ ] Add a changelog before the next release and document the versioning/release procedure.
- [ ] Verify npm trusted publishing and provenance settings, then exercise the release workflow with the next version rather than manually publishing.

Why: npm reports `0.1.0` as published, but the Git repository currently has no corresponding tag or GitHub release.

### Correct and complete command-check documentation

- [x] Remove the stale README sentence saying command checks are reserved for the future and rejected.
- [ ] Add an authoring section for command checks: manifest fields, working directory, timeouts, direct executable invocation, and the no-shell guarantee.
- [ ] Explain the local trust lifecycle: `git-hooked trust`, full `.githooked/` hashing, invalidation after any change, and appropriate use of `--yes` in automation.
- [ ] Add a small auditable command-check example and its expected failure output.

Why: command checks and explicit local trust are implemented and tested, but the README currently contradicts that behavior.

### Remove CI maintenance warnings

- [ ] Update CI and Pages workflow actions to maintained Node 24-based action releases, matching the publish workflow where applicable.
- [ ] Re-run the full matrix and confirm the GitHub Actions Node 20 deprecation annotations are gone.
- [ ] Add an npm package smoke test that packs the real artifact, installs it into a fresh repository, invokes the shipped binary, and confirms guide-pack resources are present.

## P1 — real-world beta validation

Phase D from the original plan is the next evidence-producing milestone.

- [ ] Select three to five consenting open-source TypeScript repositories representing an API, a library, a monorepo, and a database-backed service.
- [ ] Define a manual results template before running reviews. Record repository type, changed-file count, diff size, checks selected, runtime, timeout/cache behavior, findings, and reviewer disposition.
- [ ] Run default pre-commit and pre-push checks, at least one relevant guide pack, and guided security setup in dry-run mode.
- [ ] Manually classify every finding as actionable, noisy, duplicate, or incorrect. Do not collect source code or introduce telemetry.
- [ ] Record whether bounded setup proposals cite real evidence and use appropriately narrow file globs.
- [ ] Tune prompts, applicability globs, severities, and exceptions only from reviewed examples.
- [ ] Publish a sanitized `docs/BETA_RESULTS.md` containing aggregate outcomes and concrete changes made from the beta.

Exit criteria:

- pre-commit remains fast enough for routine use;
- blocking findings have an acceptably low false-positive rate;
- agent failures and partial diffs remain visible and fail according to configuration;
- setup proposals consistently cite repository evidence;
- a patch release can name the prompt or rule changes justified by the beta.

## P2 — product and test hardening

- [ ] Add native Windows coverage for hook managers where each upstream manager officially supports it.
- [ ] Add browser interaction tests for mobile navigation, copy buttons, library search, and library filters. Keep the current catalog drift test.
- [ ] Add a documented upgrade path for installed guide packs when a newer pack version exists; never overwrite locally modified checks silently.
- [ ] Decide whether guide applicability hints should power a local `guide suggest` experience. Suggestions must remain local and review-first.
- [ ] Improve `doctor` output for common setup failures such as unauthenticated Codex, missing Gitleaks, unsupported hook-manager configuration, and stale command-check trust.
- [ ] Add project governance basics before wider contribution: `SECURITY.md`, contribution guidance, issue templates, and a pull-request template.
- [ ] Configure dependency update automation and keep all dependency changes behind the existing cross-platform verification suite.

## Product decisions to make explicitly

These are choices, not assumed commitments:

1. **Next release scope:** decide whether beta-driven fixes become `0.1.1` or whether a larger feature set justifies `0.2.0`.
2. **Additional agent adapters:** the adapter boundary exists, but only Codex is supported. Add another provider only with equivalent read-only review, structured-output validation, timeout handling, and end-to-end tests.
3. **Guide distribution:** packs are currently bundled, versioned, and local. Any remote catalog would need a threat model, authenticity verification, review previews, and an explicit rule against downloaded executable content.
4. **Metrics:** preserve the no-telemetry promise. Beta measurements should remain manual, consent-based, aggregate, and source-free unless the product policy is deliberately changed.
5. **Supported runtimes:** Node.js 22+ is the current contract. Revisit it only as part of a documented release with CI coverage for every supported runtime.

## Recommended next session

Start with one small hygiene pull request before beta work:

1. Correct the command-check contradiction and add the missing authoring/trust documentation.
2. Add `CHANGELOG.md`, document the release process, and reconcile the `v0.1.0` tag/release without republishing npm.
3. Upgrade CI/Pages action versions and add the packed-artifact smoke test.
4. Turn the P1 beta checklist into tracked GitHub issues with owners or milestone labels.
5. Create the beta results template, then select the first consenting repository.

## Useful verification commands

```bash
npm ci
npm run verify
GIT_HOOKED_CODEX_INTEGRATION=1 npm run test:codex
VITE_BASE_PATH=/githooked/ npm run build:web
npm pack --dry-run
```

Run the live Codex test only from a trusted checkout with an authenticated CLI. Review package contents before any release, and never reuse an already published npm version.
