# EZ Draft build setup (Windows)

Everything in this folder is ready to commit. These steps are the parts only you can do on your PC and in your accounts. Roughly 45 minutes.

## 1. Install the tools

Open **PowerShell as Administrator** (Start → type PowerShell → right-click → Run as administrator) and run:

```powershell
wsl --install
winget install --id Git.Git -e
winget install --id OpenJS.NodeJS.LTS -e
winget install --id GitHub.cli -e
winget install --id Docker.DockerDesktop -e
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name LongPathsEnabled -Value 1 -PropertyType DWORD -Force
```

**Restart the PC** (WSL and Docker need it). Then open a normal PowerShell and run, with your own name and email:

```powershell
npm install -g pnpm
git config --global user.name "Josh Bishop"
git config --global user.email "Josh@WorthProp.com"
git config --global init.defaultBranch main
git config --global core.longpaths true
gh auth login
```

- Install the Claude Code CLI from https://code.claude.com/docs/en/setup (Windows section) and sign in with `claude` once.
- Start Docker Desktop once and turn on "Start Docker Desktop when you sign in". The local database used by agent test runs needs it (Q-0003). The Supabase CLI is added to the project by ticket EZD-004; nothing to install for it now.
- Playwright browsers (Chromium and WebKit, for the iPad/iPhone tests) are installed by the test harness ticket EZD-016 with `pnpm exec playwright install chromium webkit`; nothing to do now.
- The long-path settings matter: ticket worktrees nest deep folders and Windows otherwise stops at 260 characters.

## 2. Create the repository

```powershell
mkdir C:\Users\$env:USERNAME\Projects -Force; cd C:\Users\$env:USERNAME\Projects
gh repo create ezdraft --private --clone
cd ezdraft
```

Unzip the kit into this `ezdraft` folder so `CLAUDE.md`, `SETUP.md`, `.claude\`, `vault\`, `scripts\`, `.github\` sit at the top level. Then:

```powershell
git add -A
git commit -m "chore: build kit (vault, agents, hooks, gate, CI)"
git branch -M main
git push -u origin main
git switch -c develop
git push -u origin develop
```

## 3. Protect `main` (free on a public repository)

The repository is public (your choice, Oct 11): anyone can read the spec and code, branch protection is free, and GitHub Actions minutes are free. Never commit keys; `.env*` files are in `.gitignore` and agents cannot read or write them.

GitHub → EZ-Draft → Settings → Branches → Add branch protection rule:
- Branch name pattern: `main`
- Require a pull request before merging (approvals: 0)
- Require status checks to pass → search and add `gate` (it appears after CI has run once on `develop`)
- Do not allow bypassing the above settings (this applies the rule to you and to anything using your login, including agents)
- Leave "Allow force pushes" and "Allow deletions" off

Merging a phase PR still works: you click Merge after the `gate` check is green.

## 4. Your personal Claude Code settings

Edit `C:\Users\<you>\.claude\settings.json` (create it if missing) and add:

```json
{
  "autoContinueAtUsageLimit": true,
  "permissions": { "defaultMode": "auto" }
}
```

- `autoContinueAtUsageLimit`: a running stage waits out a usage limit and continues on its own.
- `defaultMode: auto`: sessions start in auto mode, where a safety check reviews each action instead of asking you. The project's deny rules and hooks still apply on top. Both settings only work from your user settings, not the project's.
- In the Code tab you can also pick **Auto** in the mode selector next to the send button.

## 5. Keep the PC awake during runs

```powershell
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
```

Pause Windows Update while a phase is building (Settings → Windows Update → Pause). A restart kills the session; the handoff file and STATUS.md let the next session pick up, but the in-flight ticket starts over.

## 6. Open the project in Claude

1. Claude desktop app → **Code** tab → **Local** → choose the `ezdraft` folder. Make sure the branch is `develop`.
2. Accept the trust prompt for the folder. Hooks and project agents load only after trust.
3. Check the setup in that session:
   - Ask: "What did the SessionStart hook add to your context?" → it should quote the handoff file and say Current phase: 0. (`/hooks` only works in the terminal version.)
   - Ask: "List the custom agents and their models." → planner, test-author, builder, code-reviewer, calc-auditor, ui-verifier, security-reviewer, phase-auditor, Explore.
   - Type `/` → the commands `/plan-phase`, `/questions`, `/build-phase`, `/phase-gate`, `/handoff` should appear.
4. Fable (for phase audits): run `/model fable` once to see whether your plan asks to use usage credits, then switch back with `/model opus`. Answer Q-0004 based on that.
5. Phone alerts: in the session run `/remote-control` and turn on push notifications, so a stage that stops for your answers reaches your phone.

## 7. Dry run and setup questions

In PowerShell in the repo folder:

```powershell
node vault\tools\next_ticket.mjs --check
node vault\tools\next_ticket.mjs
```

The first prints `LEDGER OK: 401 tickets`; the second prints `EZD-000` first. Then in the Code tab session ask: "Without running any tool, which ticket is next by the coordinator rule?" It must say EZD-000. If either differs, stop and send me the output.

Open `vault\questions\QUESTIONS.md`. Q-0001 to Q-0004 and Q-0006 are for you; Q-0005 and Q-0007 to Q-0010 are agent answers (from the planning session's setup brief) you can override. Also read `vault\tickets\needs-from-josh.md`: items there unblock specific tickets. You can answer them in the session: "Answer Q-0003: GitHub and Vercel exist, Supabase does not yet." The orchestrator records the answer.

## 8. Run Phase 0

In the Code tab session:

```
/plan-phase 0
```

When it finishes:

```
/questions 0
```

Answer what it asks. Then start the unattended build:

```
/goal Follow the build-phase skill for phase 0 until every ticket in vault/tickets/phases/phase-00.md is done or blocked in vault/tickets/STATUS.md, each done ticket shows a commit hash, and node scripts/gate.mjs . exits 0 on develop
```

That one line starts the build right away; you do not also type `/build-phase 0`. A separate checker reads the progress after every turn and keeps it going until the condition is true, a usage limit pauses it (it resumes on its own), or every remaining ticket is blocked waiting on you. Type `/goal` alone to see progress, `/goal clear` to stop it.

When the build stops:

```
/phase-gate 0
```

Open the PR link it gives you, click through the Vercel preview, and merge the PR yourself. That is the end of a phase. Repeat for phase 1.

## Notes

- **Vercel and the subdomain** are set up as part of ticket EZD-003 (Needs from Josh). When it asks: Vercel → Add project → import `EZ-Draft` → production branch `main`. Production deploys therefore happen only when you merge a phase PR. `develop` is pushed once per build run, so preview builds are rare. To skip `develop` previews entirely, set Vercel → Project → Settings → Git → Ignored Build Step to `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ -z "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 0 || exit 1` (builds only `main` and PRs). Then Settings → Domains → add `ezdraft.ezcontractorbinder.com` and add the CNAME it shows at your DNS host. If your DNS is at Cloudflare, set the record to "DNS only" (gray cloud) until Vercel verifies it.
- **Secrets** go in `.env.local` (never committed; agents cannot read it). The names go in `.env.example`.
- **Changing the rules** (agents, hooks, settings, gate, CI) is yours: agents are blocked from editing `.claude\`, `.github\` and `scripts\gate.mjs`.
- **If the spec changes**, re-export the changed tab into `vault\spec\` and commit it before the next `/plan-phase`.
- **Running two tickets at once** is off. To allow it later, change the Limits section of `vault\PROCESS.md`.
