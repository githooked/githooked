# githooked demo — install, init, and watch it block bad code.
#
# Renders demo-raw.mp4. Run from this directory: vhs demo.tape
# Requires: vhs, ttyd, ffmpeg, git, Node 22+, and an authenticated coding agent
# (e.g. Codex CLI) so the pre-push semantic review can run for real.
#
# The pre-push review takes ~10-20s of static screen; trim it in post, e.g.:
#   ffmpeg -i demo-raw.mp4 -filter_complex \
#     "[0:v]trim=0:T1,setpts=PTS-STARTPTS[a];[0:v]trim=T2,setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1[out]" \
#     -map "[out]" -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -movflags +faststart demo.mp4
# where T1..T2 is the static wait window after `git push`.
Output demo-raw.mp4
Set Shell "bash"
Set FontSize 20
Set Width 1200
Set Height 760
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set WaitTimeout 300s

Hide
Type "source ./setup-demo.sh"
Enter
Wait
Show

# Scene 1 — install + init
Type "# githooked: AI code review in your git hooks. Catch bad code before you push."
Enter
Sleep 2s
Type "npm install --global @githooked/cli"
Enter
Wait
Sleep 1s
Type "cd acme-api"
Enter
Type "git-hooked init"
Enter
Wait
Sleep 3s

# Scene 2 — hardcoded secret blocked at commit
Hide
Type "sed \"s/__STRIPE_KEY__/\$DEMO_STRIPE_KEY/\" ../../stage/payments-bad.js > src/payments.js && clear"
Enter
Wait
Show
Type "# ship Stripe billing -- just hardcode the key for now..."
Enter
Sleep 1s
Type "cat src/payments.js"
Enter
Sleep 3s
Type "git add -A && git commit -m 'Add Stripe billing'"
Enter
Wait
Sleep 4s

# Scene 3 — the fix hides a subtler bug
Hide
Type "cp ../../stage/payments-vuln.js src/payments.js && clear"
Enter
Wait
Show
Type "# blocked! ok: read the key from the env instead, and add the invoice export"
Enter
Sleep 1s
Type "cat src/payments.js"
Enter
Sleep 3.5s

# Scene 4 — commit passes, push gets the AI security review
Hide
Type "clear"
Enter
Wait
Show
Type "git add -A && git commit -m 'Read key from env; add invoice export'"
Enter
Wait
Sleep 2s
Type "git push origin main"
Enter
Wait
Sleep 6s

# Scene 5 — outro
Hide
Type "clear"
Enter
Wait
Show
Type "# Hooky has your back: npm install --global @githooked/cli"
Enter
Sleep 4s
