# Git Hooked documentation

## Requirements

- Node.js 22 or newer
- Git and a Git repository
- An authenticated Codex, Claude Code, Gemini CLI, GitHub Copilot CLI, or Cursor Agent installation

No Git Hooked account or additional API key is required.

## Quick start

```sh
cd your-repository
npm install --save-dev @githooked/cli
npx git-hooked init
npx git-hooked check pre-push
```

Native hooks prefer this repository-pinned executable and fall back to a global installation when one is available.

Initialization creates `.githooked/config.yml`, hook configuration, and managed blocks in local Git hooks. Existing hook content is preserved and repeated initialization is safe. If Husky, Lefthook, or pre-commit is detected, Git Hooked leaves that manager's hooks untouched and prints integration instructions.

## Daily workflow

Commit and push normally. Pre-commit runs fast deterministic checks. Pre-push asks the configured coding agent to review a bounded outgoing diff. Fix blocking findings and try again, or deliberately run `git-hooked fix` for the latest completed review.

Git Hooked has no hosted proxy and no telemetry. Agent review uses the authenticated CLI installed on the machine.

## Configure hooks

Hook YAML references built-ins as `builtin:<id>` and repository checks as `check:<id>`.

```yaml
checks:
  - builtin:security-review
  - builtin:missing-tests
  - builtin:breaking-changes
  - check:tenant-isolation
```

## Custom rules

```sh
git-hooked rule add "Every database query must include tenantId" --dry-run
git-hooked rule add "Every database query must include tenantId"
```

Git Hooked shows the hook, severity, file globs, evidence, instructions, and generated scripts before writing. Generated commands are syntax-checked but cannot run until reviewed and approved with `git-hooked trust`. Commit `.githooked/` so the team shares the same auditable rules.

## Guide packs

```sh
git-hooked guide list
git-hooked guide inspect security/multi-tenant
git-hooked guide add security/multi-tenant
```

Available packs cover web API security, multi-tenant isolation, payments, API quality, and database quality.

## Guided security setup

```sh
git-hooked setup security --dry-run
git-hooked setup security --focus auth,database --max-proposals 5
```

Discovery runs locally. Sensitive files, credentials, dependency directories, and build output are excluded from agent context. Dry-run and non-interactive modes do not modify `.githooked/`.

## Maintenance

```sh
git-hooked doctor
git-hooked doctor --test-agent
git-hooked fix
git-hooked uninstall
git-hooked uninstall --remove-config
```

An explicit one-off bypass is `GIT_HOOKED_SKIP=1 git push`; it is visibly reported and is not treated as a successful review.

## Related

- [Check library](https://githooked.github.io/githooked/library/index.md)
- [Source repository](https://github.com/githooked/githooked)
