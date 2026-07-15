# Guide pack authoring

Guide packs are versioned, local templates that install ordinary semantic checks. They cannot declare commands, download resources, or execute code.

## Layout

Packs live under `guide-packs/<category>/<name>/` and are registered explicitly in `src/guides/registry.ts`.

```text
guide-packs/security/example/
├── pack.yml
├── authentication.md
└── authorization.md
```

`pack.yml` declares:

- `schema_version`, independently incremented pack `version`, and the stable `<category>/<name>` id;
- compatible Git Hooked configuration versions;
- the default hook;
- optional applicability hints;
- semantic check ids, names, categories, severities, repository-relative globs, and instruction files.

Check ids are global after installation, so they must not collide with built-ins, another pack, or likely repository-owned ids. Instruction paths must remain inside the pack and should describe a durable review policy rather than one implementation.

Increment the pack `version` whenever a manifest or instruction changes. Installed receipts bind that version to exact template hashes; Git Hooked will not silently reinterpret an existing installation after published template content changes.

## Review expectations

Every new or changed pack should be reviewed for:

1. A concrete issue class with a low false-positive rate.
2. Severity proportional to realistic impact.
3. Narrow but useful applicability globs.
4. Instructions that require evidence from the diff and state important exceptions.
5. No shell commands, executable fields, remote resources, secrets, or generated policy.
6. A registry snapshot update and install/remove coverage.

Run:

```bash
npm test
npm run typecheck
npm run lint
```

## Installation ownership

Installation copies manifests and Markdown into `.githooked/checks/`, adds normal hook references, and records content hashes in `.githooked/guides/`. Removal only deletes files that still match that receipt. If a repository edits an installed check or hook reference, Git Hooked preserves the pack and asks the user to resolve the local changes explicitly.
