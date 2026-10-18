# EZ Draft build setup (Mac mini)

The build machine is the Mac mini (moved from the Windows PC on Oct 17, 2026; the Windows section at the end is history). These are the parts only you can do on the Mac and in your accounts. The process is `vault/PROCESS.md` (v2) with the project additions in `vault/PROCESS-EZDRAFT.md`.

## 1. Install the tools (Terminal)

```bash
# Homebrew (skip if installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git gh fnm
brew install --cask docker
fnm install 22 && fnm default 22      # Node 22 matches CI and EZD-000's engines
echo 'eval "$(fnm env --use-on-cd)"' >> ~/.zshrc && source ~/.zshrc
node -v                               # v22.x
corepack enable && corepack prepare pnpm@latest --activate && pnpm -v
git config --global user.name "Josh Bishop"
git config --global user.email "Josh@WorthProp.com"
git config --global init.defaultBranch main
```

- **GitHub CLI signs in as the agent account** `ironframe414-agent` (Q-0108): `gh auth login` with that account; `gh auth status` must show it. You do GitHub admin in the browser under your own account.
- Claude Code: the native installer from https://code.claude.com/docs/en/setup (macOS), then `claude` once to sign in with the Max plan. The desktop app's Code tab (Local) works the same way.
- Start Docker Desktop once; turn on "Start Docker Desktop when you sign in"; Settings → Resources: leave memory at the default (32 GB machine). The local Supabase used by agent test runs needs it (Q-0003).
- Playwright browsers are installed by EZD-016a (`pnpm exec playwright install chromium webkit`); approve it when the build asks. Workers = 4 (Q-0114).

## 2. Clone

```bash
mkdir -p ~/Projects && cd ~/Projects
gh repo clone IronFrame414/EZ-Draft ezdraft
cd ezdraft && git switch develop && git pull
node vault/tools/next_ticket.mjs --check      # LEDGER OK: 405 tickets
node vault/tools/next_ticket.mjs --next-unit  # build EZD-000
```

## 3. Your personal Claude Code settings

`~/.claude/settings.json` (create it if missing):

```json
{ "permissions": { "defaultMode": "auto" } }
```

Nothing else. Do **not** set `autoContinueAtUsageLimit` (PROCESS.md section 11): a weekly limit must stop the run and notify you, not leave a session waiting for days. `defaultMode: auto` works only in user settings; the project's deny rules and hooks still apply on top.

## 4. Launcher config (untracked; agents cannot read it)

Create `scripts/launcher.config.json`:

```json
{
  "notify_cmd": "curl -s -d \"$MSG\" https://ntfy.sh/<your-long-random-topic>",
  "auth_mode": "plan",
  "limit_formats_confirmed": false
}
```

Use a long random topic name; anyone who knows it can read the topic on ntfy.sh. Add `"api_key": "sk-ant-…"` only if you ever use `node scripts/budget.mjs --api-until-reset` (section 11). The file is gitignored and read-denied for agents.

## 5. Budget (section 11)

The launcher refuses to run unattended until `vault/budget.json` has a weekly ceiling. Recommended order: build EZD-000 and EZD-001 interactively, compare `/usage` in Claude Code with `vault/cost/log.jsonl` for the same days, then:

```bash
node scripts/budget.mjs --set-ceiling <usd per week> --set-cap <usd per unit> --set-fable <usd per week>
node scripts/budget.mjs          # shows the week's spend and the ceilings
```

Overrides when a hold happens: `--raise <usd>`, `--until-reset`, `--api-until-reset` (each removes `vault/handoff/BUDGET_HOLD.md`). The weekly window resets Monday 2:00 AM Eastern.

## 6. Keep the Mac awake

The launcher runs `caffeinate` for its own lifetime. For interactive sessions: System Settings → Energy → Prevent automatic sleeping when the display is off, and pause macOS updates while a phase is building. FileVault stays on. A restart kills a session; the builder's `wip` commits on the ticket branch let the next unit resume the ticket.

## 7. Open the project in Claude Code

1. Claude desktop app → Code tab → Local → `~/Projects/ezdraft`, branch `develop`; accept the trust prompt (hooks, agents and skills load only after trust).
2. Ask: "What did the SessionStart hook add to your context?" → it quotes the handoff, the ledger line and `Next unit: build EZD-000`.
3. Ask: "List the custom agents and their models." → planner, test-author, builder, code-reviewer, calc-auditor, ui-verifier, security-reviewer, phase-auditor, Explore, each with a full model ID (`claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1`).
4. Type `/` → `/spec-check`, `/plan-ticket`, `/review-plans`, `/questions`, `/build-ticket`, `/gate-phase`, `/wrap`.
5. Ask, without tools: "Which unit is next?" → `build EZD-000`. If it differs from `node vault/tools/next_ticket.mjs --next-unit`, stop and say so.

## 8. Run Phase 0

Interactive (until the ceiling is set):

```
/build-ticket EZD-000
```

One ticket per session; `/clear` after each, then the next `/build-ticket <id>` (the session-start hook names it). When `vault/budget.json` has a ceiling, unattended:

```bash
node scripts/run.mjs            # loops: next unit → fresh claude -p → cost log → ledger check
node scripts/run.mjs --status   # budget, next unit, which CLI flags the installed version supports
node scripts/run.mjs --once     # one unit
```

It stops and notifies you (ntfy) only when something needs you: budget hold, questions, sign-off, a blocked phase, a failed ledger check, a built phase. `touch vault/handoff/STOP` stops it after the current unit. When Phase 0 is built it runs `gate-phase 0`, opens the PR and notifies you; you work the punch list on the preview and merge; then it runs `wrap 0` and stops at Phase 1's `spec-check` (needs you; see `vault/tickets/PHASES.md` for the re-cut to approve first).

## Notes

- **Vercel:** project `ezdraft`, root `app`, production branch `main`, domain `ezdraft.ezcontractorbinder.com` (done Oct 12). The Ignored Build Step is Q-0116 (your decision): PROCESS.md v2 section 12 sets it to `[ "$VERCEL_GIT_COMMIT_REF" != "main" ] && [ -z "$VERCEL_GIT_PULL_REQUEST_ID" ] && exit 0 || exit 1` so only `main` and PRs build.
- **Secrets** go in `.env.local` (never committed; agents cannot read it) or in Vercel / Supabase / GitHub environments. Names go in `.env.example`.
- **Changing the rules** (agents, hooks, skills, settings, gate, launcher, CI, `vault/PROCESS*.md`) is yours; agents are blocked from editing them and propose changes in the handoff instead.
- **If the spec changes**, the change is a decision in `vault/spec/decisions/<area>.md`; spec section files stay as exported (rule 4).
- **Two tickets at once** is off (`vault/PROCESS-EZDRAFT.md` section 8).

## History: Windows PC (no longer a build machine)

The build ran on the Windows PC from Oct 11 to Oct 17, 2026 (PowerShell, WSL, Docker Desktop with a 6 GB cap, Node 24). All EZ Draft files were removed from it on Oct 18. If it ever becomes a build machine again: Node 22, `LongPathsEnabled`, `git config core.longpaths true`, and the Playwright worker count goes back to 2 (Q-0019).
