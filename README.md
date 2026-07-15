# Git Hooked

Catch bad code before you push using the coding-agent CLI you already have installed.

Git Hooked is a local, open-source Git hook orchestrator. It does not run an AI proxy, upload code to a Git Hooked server, collect telemetry, or require another API key.

[Read the usage guide](https://githooked.github.io/githooked/docs/) · [Browse the built-in check library](https://githooked.github.io/githooked/library/)

## Two-minute setup

Requirements: Node.js 22+, Git, and an authenticated Codex CLI.

```bash
npm install --global @githooked/cli
cd your-repository
git-hooked init
git-hooked check pre-push
```

Initialization creates a `.githooked/` configuration directory and safely adds managed blocks to `.git/hooks/pre-commit` and `.git/hooks/pre-push`. Existing hook content is preserved, and initialization is idempotent.

If the repository already uses Husky, Lefthook, or pre-commit, initialization creates the configuration but leaves that manager's hooks untouched. Install Git Hooked as a project development dependency (`npm install --save-dev @githooked/cli`) and use the manager-specific integration printed by `git-hooked init`.

### Existing hook managers

Husky:

```sh
# .husky/pre-commit
npx --no-install git-hooked check pre-commit

# .husky/pre-push
npx --no-install git-hooked check pre-push "$@"
```

Lefthook (`lefthook.yml`):

```yaml
pre-commit:
  commands:
    git-hooked:
      run: npx --no-install git-hooked check pre-commit
pre-push:
  commands:
    git-hooked:
      run: npx --no-install git-hooked check pre-push
```

pre-commit (`.pre-commit-config.yaml`):

```yaml
repos:
  - repo: local
    hooks:
      - id: git-hooked-pre-commit
        name: Git Hooked pre-commit
        entry: npx --no-install git-hooked check pre-commit
        language: system
        pass_filenames: false
        stages: [pre-commit]
      - id: git-hooked-pre-push
        name: Git Hooked pre-push
        entry: npx --no-install git-hooked check pre-push
        language: system
        pass_filenames: false
        stages: [pre-push]
```

Then install both pre-commit stages:

```sh
pre-commit install --hook-type pre-commit --hook-type pre-push
```

```text
.githooked/
├── config.yml
├── hooks/
│   ├── pre-commit.yml
│   └── pre-push.yml
└── checks/
    └── tenant-isolation/
        ├── check.yml
        └── instructions.md
```

Hook files reference either shipped checks such as `builtin:env-files` or repository checks such as `check:tenant-isolation`. Repository checks can be semantic agent reviews or explicitly trusted local commands.

Plan a repository rule with the configured coding agent:

```bash
git-hooked rule add "Every database query must include tenantId"
```

The agent receives the requested rule, enabled checks, and the same bounded repository context used by guided security setup. It runs in an isolated read-only directory and returns a validated plan. Git Hooked asks focused clarification questions when the policy cannot be inferred safely.

Depending on the rule, the plan can be:

- already covered by an enabled check;
- a semantic check evaluated by the coding agent on relevant diffs;
- a deterministic `check.mjs` command check; or
- a hybrid whose deterministic check runs before semantic review.

Use `--dry-run` to inspect the plan without writing configuration. `--yes` skips the final creation prompt but never trusts generated executable code:

```bash
git-hooked rule add "Public APIs must not expose internal IDs" --dry-run
git-hooked rule add "Public APIs must not expose internal IDs" --yes
```

Before writing, Git Hooked shows the selected hook, severity, applicability globs, evidence, semantic instructions, and any complete generated script. Generated scripts are syntax-checked but not executed or trusted. Review command checks, then explicitly trust the current configuration:

```bash
git-hooked trust
```

The complete `.githooked` tree is hashed into local Git configuration. Any manifest, instruction, or script change invalidates that trust. Commands run directly from their own check directory without a shell.

Useful lifecycle commands:

```bash
git-hooked doctor
git-hooked doctor --test-agent
git-hooked fix
git-hooked uninstall
git-hooked uninstall --remove-config
```

Successful semantic reviews are cached privately under `.git/githooked`; unchanged diffs and configuration do not invoke the agent again. The latest completed review is stored there for the explicit `fix` workflow.

When Gitleaks is installed, the default pre-commit checks invoke its official staged scan with secret redaction. If it is unavailable, Git Hooked says so visibly and continues with its built-in `.env` and conflict-marker checks.

Bypass a local hook explicitly with `GIT_HOOKED_SKIP=1 git push`. The bypass is visibly reported and is not presented as a successful review.

## Example repositories

These public repositories contain a tagged baseline and a review scenario on `main`, so each Git Hooked result can be replayed locally:

- [Insecure Express API](https://github.com/githooked/example-express-insecure-api) demonstrates unauthenticated cross-tenant data access and missing security tests. Start from `scenario-baseline`.
- [Secure Express API](https://github.com/githooked/example-express-secure-api) adds tenant-scoped authorization and regression tests. Start from `insecure-baseline`.
- [TypeScript breaking change](https://github.com/githooked/example-typescript-breaking-change) keeps its local tests green while replacing a public API. Start from `v1-baseline`.
- [Workspace monorepo](https://github.com/githooked/example-workspace-monorepo) scopes a change to one workspace and includes a filename containing spaces. Start from `scenario-baseline`.

Each repository README includes commands for comparing and replaying its scenario.

## Guided security setup

After initialization, Git Hooked can inspect a bounded repository map and propose repository-specific semantic security checks:

```bash
git-hooked setup security --dry-run
git-hooked setup security --focus auth,database --max-proposals 5
```

Discovery runs locally first. Codex receives detected technologies, up to 400 repository paths, selected configuration files, existing checks, and small relevant source excerpts in read-only mode. Sensitive files such as `.env`, private keys, credentials, dependency directories, and build output are excluded.

Interactive mode presents each proposal, its evidence, confidence, and exact file changes before asking for approval. Approved proposals become ordinary auditable semantic checks under `.githooked/checks/` and are attached to pre-push. Dry-run and non-interactive modes never modify `.githooked` configuration.

For automation, write the validated proposal report without installing checks:

```bash
git-hooked setup security --non-interactive --output proposals.json
```

## Curated guide packs

Git Hooked ships versioned local guide packs whose complete rules can be inspected before installation:

```bash
git-hooked guide list
git-hooked guide inspect security/multi-tenant
git-hooked guide add security/multi-tenant
git-hooked guide remove security/multi-tenant
```

Available packs cover web API security, multi-tenant isolation, payments, API quality, and database quality. Adding or removing a pack shows every affected file and hook reference. Installed checks are normal Markdown and YAML under `.githooked/`; removal refuses to delete locally modified checks. Use `--yes` with `guide add` or `guide remove` only after reviewing the preview in automation.

See [the guide-pack authoring documentation](docs/GUIDE_PACKS.md) for the schema and review expectations.

## Development

```bash
npm install
npm test
npm run test:examples
npm run typecheck
npm run lint
npm run build
```

The example suite creates fresh temporary Git repositories, installs the real hooks, and exercises recorded pass, warning, failure, and malformed agent responses through actual commits and pushes. Fixture diagnostics are written to `test-results/examples/` when available.

The Ubuntu hook-manager integration suite additionally requires Python, `pre-commit`, and Lefthook; Husky is installed as a development dependency:

```bash
python -m pip install lefthook pre-commit
npm run test:hook-managers
```

Run the opt-in live Codex check only from a trusted development checkout:

```bash
GIT_HOOKED_CODEX_INTEGRATION=1 npm run test:codex
```

See [Rule planner production verification](docs/RULE_PLANNER_TESTING.md) for the tested behavior, security invariants, and remaining release risks.

Reviews use `codex exec` with an ephemeral read-only sandbox. `fix` is a separate deliberate command and is the only workflow that selects `workspace-write`.
