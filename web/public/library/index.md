# Git Hooked check library

Git Hooked ships deterministic pre-commit checks, coding-agent-powered pre-push reviews, and installable guide packs. Built-ins use stable `builtin:<id>` references.

## Built-in checks

- `builtin:secrets` — Runs Gitleaks against staged changes with secret redaction when Gitleaks is installed. Deterministic, critical, pre-commit default.
- `builtin:env-files` — Stops staged `.env` files while allowing documented `.env.example` templates. Deterministic, high severity, pre-commit default.
- `builtin:conflict-markers` — Detects newly added merge-conflict markers. Deterministic, high severity, pre-commit default.
- `builtin:security-review` — Uses the configured coding agent to find exploitable security problems in the outgoing diff. Semantic, pre-push default.
- `builtin:missing-tests` — Finds changed behavior without relevant automated test coverage. Semantic, pre-push default.
- `builtin:breaking-changes` — Finds backward-incompatible API or contract changes. Semantic, opt-in.

## Curated guide packs

Inspect a pack before adding it:

```sh
git-hooked guide inspect security/web-api
git-hooked guide add security/web-api
```

- `security/web-api` — Authentication, authorization, input validation, secret exposure, and redirect safety.
- `security/multi-tenant` — Tenant-aware authorization, query scoping, and cache isolation.
- `security/payments` — Idempotency, amount integrity, authorization, and audit trails.
- `quality/api` — Public contract compatibility and API behavior tests.
- `quality/database` — Migration safety, transaction boundaries, and query correctness.

Installed pack checks are normal editable Markdown and YAML under `.githooked/`. Removal refuses to delete a pack check modified by the team.

## Custom repository checks

```sh
git-hooked rule add "Every database query must include tenantId"
```

Git Hooked can reuse an existing check, create a deterministic command, define a semantic coding-agent review, or combine both. It previews all files before writing and does not automatically trust generated executable code.

## Related

- [Documentation](https://githooked.github.io/githooked/docs/index.md)
- [Source repository](https://github.com/githooked/githooked)
