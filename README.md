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
