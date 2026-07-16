# Git Hooked

Catch bad code before you push with Git hooks powered by the coding agent you already use.

Git Hooked is free, open source, local to your repository, and needs no Git Hooked account or additional API key. It supports Codex, Claude Code, Gemini CLI, GitHub Copilot CLI, and Cursor Agent.

## Install

Requirements: Node.js 22 or newer, Git, a Git repository, and an authenticated supported coding-agent CLI.

```sh
npm install --save-dev @githooked/cli
npx git-hooked init
```

The default `auto` provider scans for supported agent CLIs and uses the first available one. Initialization creates reviewable configuration under `.githooked/`, installs managed pre-commit and pre-push hook blocks, and preserves existing hook content.

### Prompt for an AI coding agent

> Install Git Hooked in this repository as a development dependency, then run `npx git-hooked init`. Verify Node.js 22+, Git, and a supported coding-agent CLI first. Review the files and hooks it creates, then tell me what was installed and which agent was detected. Do not bypass any safety checks.

## How it works

1. Install `@githooked/cli` as a development dependency and run `npx git-hooked init` once.
2. Write code, stage files, commit, and push normally.
3. Fast deterministic checks run before commit; deeper coding-agent reviews run before push. Findings explain the issue and block the operation when required.

Code is sent only through the user's existing authenticated agent CLI, not through a Git Hooked service.

## Plain-language repository rules

Create a rule from a repository policy:

```sh
git-hooked rule add "API responses must never expose accessToken"
```

Git Hooked can reuse an enabled check, create a deterministic script, define a semantic prompt for the configured agent, or combine deterministic and semantic checks. It previews the plan and generated files before writing. Generated executable checks remain untrusted until explicitly reviewed and trusted.

## More information

- [Documentation](https://githooked.github.io/githooked/docs/index.md)
- [Check library](https://githooked.github.io/githooked/library/index.md)
- [Source repository](https://github.com/githooked/githooked)
