# Example projects and guided setup plan

## Goal

Prove Git Hooked against representative repositories, then add guided setup that can inspect a codebase and propose useful repository checks without silently changing policy.

## 1. Example-project test suite

Create disposable fixtures under `examples/fixtures/`. Each fixture should be small, deterministic, and contain an explicit expected-results manifest.

| Fixture | Purpose | Expected result |
| --- | --- | --- |
| `express-insecure-api` | Missing authentication, tenant isolation, and tests | High/critical findings block pre-push |
| `express-secure-api` | Corrected form of the same API | Review passes |
| `typescript-library-breaking-change` | Removed export and changed public type | Breaking-change finding blocks |
| `workspace-monorepo` | Multiple packages and scoped tests | Only relevant packages and context are reviewed |
| `staged-secrets` | `.env`, conflict marker, scanner fixture | Fast pre-commit checks block without AI |
| `large-diff` | Diff over the configured limit | Partial analysis is disclosed and remains safe |

Run every fixture in a newly initialized temporary Git repository. Exercise actual `git commit` and `git push` operations, filenames containing spaces, a branch with an upstream, and a new branch without one.

Use three test layers:

1. Deterministic CI tests use recorded valid, warning, failing, and malformed agent responses.
2. Hook-manager integration tests install and run native hooks for Git, Husky, Lefthook, and pre-commit.
3. An opt-in live suite invokes Codex only when `GIT_HOOKED_CODEX_INTEGRATION=1` is set. It must use read-only review mode and tolerate wording differences while asserting the structured result.

Add scripts:

```text
npm run test:examples
npm run test:hook-managers
GIT_HOOKED_CODEX_INTEGRATION=1 npm run test:codex
```

Run deterministic example tests on Ubuntu, macOS, and Windows. Run tool-specific manager tests on Ubuntu initially, then add native Windows coverage where each manager officially supports it.

## 2. Guided security setup

Proposed command:

```bash
git-hooked setup security
```

The first version should be an interactive, review-first wizard:

1. Detect languages, frameworks, package managers, database clients, authentication libraries, API entry points, and test tooling using manifests and filenames.
2. Run deterministic discovery first. Do not send the complete repository to an agent.
3. Give Codex a bounded repository map, selected configuration files, existing `.githooked/` checks, and small relevant excerpts in read-only mode.
4. Require a structured proposal containing rule text, rationale, evidence paths, suggested severity, applicable file globs, and confidence.
5. Deduplicate proposals against existing checks and built-ins.
6. Present proposals individually. Nothing is written until the user confirms it.
7. Show the exact files and hook references that will be created.
8. Create normal `.githooked/checks/<id>/check.yml` and `instructions.md` files through the existing configuration writer.
9. Run a dry review and report whether each new check is actionable or noisy.

Useful options:

```text
git-hooked setup security --dry-run
git-hooked setup security --non-interactive --output proposals.json
git-hooked setup security --focus auth,database
git-hooked setup security --max-proposals 5
```

Example proposal:

```text
Suggested security check: tenant-isolation

Evidence:
  Prisma is used in src/db/client.ts
  Authenticated account IDs are read in src/auth/session.ts
  Route queries exist under src/routes/**

Rule:
  Every tenant-owned database query must be scoped to the authenticated tenant ID.

Add to pre-push? [Y/n]
```

## 3. Guide packs

After the discovery workflow is stable, add curated, versioned guide packs. Packs are local templates, not remotely executed code.

Initial packs:

- `security/web-api`: authentication, authorization, input validation, secrets, and unsafe redirects.
- `security/multi-tenant`: tenant scoping and cross-tenant access.
- `security/payments`: idempotency, amount handling, authorization, and audit trails.
- `quality/api`: breaking changes and required tests.
- `quality/database`: migrations, transaction boundaries, and query scoping.

Proposed commands:

```text
git-hooked guide list
git-hooked guide inspect security/multi-tenant
git-hooked guide add security/multi-tenant
git-hooked guide remove security/multi-tenant
```

Each pack should declare its version, compatible Git Hooked configuration version, checks, default hook, severity, instructions, and optional applicability hints. Installing a pack must copy auditable text configuration into `.githooked/`; it must never download or execute arbitrary scripts.

## 4. Delivery phases

### Phase A — confidence harness

- Add the six example fixtures and expected-results manifests.
- Add a reusable temporary-repository harness.
- Automate native Git and hook-manager workflows.
- Publish test artifacts when a fixture fails.

Acceptance: all deterministic scenarios pass on the cross-platform CI matrix and malformed agent output never passes a review.

### Phase B — security proposal engine

- Add repository fingerprinting and bounded context selection.
- Define and validate the proposal schema with Zod.
- Add `setup security --dry-run` with recorded-agent tests.
- Add interactive approval and configuration writes.

Acceptance: setup makes no changes in dry-run/review mode, never executes agent-suggested commands, avoids duplicate rules, and produces valid existing check files after approval.

### Phase C — curated guides

- Define the guide-pack schema and local registry.
- Ship the initial packs with snapshot tests.
- Add list, inspect, add, and remove commands.
- Document authoring and review expectations.

Acceptance: guide installation and removal are idempotent, preserve user-owned checks, and show a complete change preview.

### Phase D — real-world beta

- Run against several consenting open-source TypeScript repositories.
- Record runtime, diff size, false positives, timeouts, and user decisions without collecting source code or enabling telemetry.
- Tune prompts and packs from manually reviewed outcomes.

Acceptance: pre-commit remains fast, proposals cite concrete repository evidence, and the beta has a documented false-positive review rather than only pass/fail counts.
