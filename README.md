# Git Hooked

Catch bad code before you push using the coding-agent CLI you already have installed.

Git Hooked is a local, open-source Git hook orchestrator. It does not run an AI proxy, upload code to a Git Hooked server, collect telemetry, or require another API key.

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

Hook files reference either shipped checks such as `builtin:env-files` or repository checks such as `check:tenant-isolation`. Semantic checks own an `instructions.md`. Command-check manifests are reserved for the future and are rejected until an explicit local trust mechanism is implemented.

Add a semantic repository check with:

```bash
git-hooked rule add "Every database query must include tenantId"
```

This creates a check directory and attaches it to `.githooked/hooks/pre-push.yml`.

Repository command checks run from their own check directory and require explicit local trust:

```bash
git-hooked trust
```

The complete `.githooked` tree is hashed into local Git configuration. Any manifest, instruction, or script change invalidates that trust. Git Hooked never invokes commands through a shell.

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

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

Reviews use `codex exec` with an ephemeral read-only sandbox. `fix` is a separate deliberate command and is the only workflow that selects `workspace-write`.
