# Demo video

`demo.mp4` (58s, 1200×760) and `demo.gif` (960px wide) showcase Git Hooked end to end:

1. `npm install --global @githooked/cli` and `git-hooked init` in a small demo repo.
2. A hardcoded Stripe key is blocked instantly at `git commit` by the built-in secrets check (gitleaks).
3. The key moves to an env var, but the same commit adds a command-injection bug — the commit passes the fast checks, and `git push` triggers the live semantic security review, which flags the injection and blocks the push.

Everything in the recording is real: the npm install, the hooks, and the agent-backed pre-push review.

## Re-rendering

Requirements: [vhs](https://github.com/charmbracelet/vhs), ttyd, ffmpeg, git, Node 22+, and an authenticated coding agent (e.g. Codex CLI) so the pre-push review runs for real.

```sh
cd demo
vhs demo.tape   # renders demo-raw.mp4 (~65s)
```

`demo.tape` sources `setup-demo.sh` (hidden) to build a pristine throwaway repo under `demo/work/`, then plants the staged file variants from `stage/` between scenes. The pre-push review leaves ~10–20s of static screen after `git push`; cut that window and re-encode (see the comment at the top of `demo.tape`), then regenerate the GIF:

```sh
ffmpeg -i demo.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" demo.gif
```

The review output varies run to run (severity wording, finding order); re-render until the push is blocked with a HIGH/CRITICAL finding if it matters for the cut.
