# Rule planner production verification

The `git-hooked rule add` workflow is covered at four boundaries: validated planner output, interactive CLI behavior, installed configuration, and real Git hooks. The default suite is deterministic and does not require a Codex login. Live model checks are deliberately opt-in.

## Release gate

Run the deterministic release gate on every supported platform:

```bash
npm ci
npm run verify
```

Before a release, also run the authenticated live planner checks from a trusted checkout:

```bash
GIT_HOOKED_CODEX_INTEGRATION=1 npm run test:codex
```

The live suite may take several minutes. Each operation has a 120-second adapter timeout and a 150-second test timeout.

For packaging and hook-manager coverage, run:

```bash
npm run test:hook-managers
npm pack --dry-run
```

The hook-manager suite requires Husky, Lefthook, and pre-commit as described in the README.

## Covered behavior

The automated tests verify:

- all planner outcomes: `ready`, `needs_clarification`, and `already_covered`;
- semantic, command, and hybrid implementations;
- strict structured-output parsing, required fields, unknown-field rejection, malformed JSON, non-zero exits, and timeouts;
- path, glob, identifier, hook, confidence, generated-script, and control-character validation;
- prompt-injection containment and bounded repository context that omits unselected secrets;
- empty and oversized requests or answers, duplicate questions, answer replacement, and the clarification-round limit;
- interactive approval, cancellation, `--dry-run`, `--yes`, and non-interactive fail-closed behavior;
- duplicate rule identifiers before approval, script syntax validation before installation, and rollback after a write failure;
- command applicability filtering and trust invalidation after configuration changes;
- actual CLI subprocesses, actual native Git hooks, blocked unsafe commits, and allowed safe commits;
- live Codex decisions for a deterministic source scan, an already-covered `.env` policy, and contextual API-response protection.

## Security invariants

Planner output is untrusted. Git Hooked validates the complete response before showing or writing a plan. Codex planning runs in an isolated read-only directory with bounded context. Generated scripts are displayed and syntax-checked, but are neither executed during creation nor trusted automatically. A user must explicitly run `git-hooked trust`; any later `.githooked` change invalidates that trust.

## Remaining release risks

- Live model decisions are probabilistic. Keep the deterministic schema and flow suite as the merge gate, and use live checks as a release smoke test.
- Generated command rules still require human review before trust. The product must not add an automatic trust flag to `rule add`.
- Hook-manager integration depends on external tools and is separate from the default suite. Run it in its Ubuntu CI job before release.
- Platform-specific behavior must remain green in the configured Linux, macOS, and Windows CI matrix; a local run cannot replace that matrix.
- The project intentionally has no telemetry, so beta failures need consent-based reports with secrets removed.
