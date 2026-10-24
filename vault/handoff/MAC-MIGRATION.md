# EZ Draft: move to the Mac mini (handoff, 2026-10-14; amended 2026-10-18)

Written from a check of the Windows build PC on Oct 14, 2026. **Oct 18 status:** the clone is on the Mac (`~/Projects/ezdraft`, `develop`), process v2 is applied (`PROCESS-V2-MIGRATION.md`), items 1 to 7 below are recorded (Q-0114, Q-0115; SETUP.md rewritten for macOS; agent files cleaned). Remaining on the Mac itself: finish the setup steps in `SETUP.md` (Node 22, pnpm, Docker Desktop, `gh` as the agent account) and the checks in "First Mac session" step 2.

## State on the Windows PC (C:\Users\JSBis\Projects\ezdraft)

| Item | State |
| --- | --- |
| Branch | `develop` at `a4492eb` ("docs(vault): session end"), working tree clean, no stashes |
| Unpushed work | **`develop` was 15 commits ahead of `origin/develop` (`aad5540`).** All Phase 0 planning and questions work. Josh pushes from Windows before the Mac clones (see "Before the Mac clones") |
| `main` | `aee21dc` "Build kit", same as `origin/main` |
| Worktrees / ticket branches | None. Only the main checkout; no `t/EZD-*` branches |
| Phase 0 | Stage 1 plan done (`56ad715`, 37 plans). Stage 2 questions done (`993bf73`, `801019e`, follow-ups Q-0088 to Q-0113). All 37 Phase 0 tickets `ready` |
| Stage 3 build | **Not started.** No app code exists: no `app/`, no `package.json`, no `node_modules` |
| Ledger | `node vault/tools/next_ticket.mjs --check` → `LEDGER OK: 405 tickets` |
| Running | Nothing for EZ Draft. The EZ Binder build is the only work on the Windows PC |
| Local secrets | None. No `.env*` files exist in the repo folder. All keys live in Vercel, Supabase and GitHub (environment `dev` holds `SUPABASE_DEV_DB_URL`). Nothing to copy |
| Tool versions on Windows | Node v24.20.0, pnpm 12.11.2, Docker Desktop (WSL, capped 6 GB / 4 CPU) |

## Accounts (set up and verified Oct 12; nothing changes for the Mac)

- Supabase: one project, used as dev/test (Q-0113). Production project, Sentry, Backblaze backups and release keys wait for EZD-023b's "Before launch" checklist.
- Vercel project `ezdraft` (root `app`, branch `main`, env vars set). DNS CNAME at Spaceship resolves with valid HTTPS.
- Resend keys and Supabase SMTP set.
- GitHub: repo `IronFrame414/EZ-Draft` (public). Agent account **`ironframe414-agent`** has the Write role (Q-0108). Rulesets on `main` (PR, 1 approval, latest-push approval, stale dismissed, agent cannot bypass), `develop` and `phase-*` tags. Environments `dev` (develop only) and `release` (main only).

## Before the Mac clones (Josh, on Windows, PowerShell)

```powershell
cd $HOME\Projects\ezdraft
git add vault/handoff/MAC-MIGRATION.md
git commit -m "docs(vault): Mac migration handoff"
git push origin develop
git status
```

`git status` must say "up to date with 'origin/develop'". After that, do not run EZ Draft on Windows again.

## Mac setup that must match

- **GitHub sign-in on the Mac is the agent account `ironframe414-agent`, not Josh's account** (Q-0108). `gh auth status` must show `ironframe414-agent`. Josh does GitHub admin in the browser under his own account.
- **Node 22** (`engines` in EZD-000's plan is `22.x`, and CI installs Node 22). The Windows PC ran Node 24; on the Mac use 22 so local, CI and `engines` match. pnpm: current version. EZD-000 pins `packageManager` to whatever `pnpm -v` prints on the Mac.
- Docker Desktop running, memory set in Docker Desktop → Settings → Resources (no `.wslconfig` on Mac).
- User setting `~/.claude/settings.json`: `{ "permissions": { "defaultMode": "auto" } }` only. ~~`autoContinueAtUsageLimit: true`~~ withdrawn Oct 18: PROCESS.md v2 section 11 says leave it unset on build machines so a weekly limit never leaves a session silently waiting for days. If it was set on the Mac, remove it.
- Clone to `~/Projects/ezdraft`, branch `develop`.
- `.gitattributes` already forces LF; hooks and `scripts/gate.mjs` are plain Node and already handle non-Windows. No code conversion is needed.

## Items the move changes (first Mac session: record, do not build yet)

1. **Q-0019 is a Windows-PC answer** (16 GB RAM, Playwright workers = 2, one gate at a time). Plans EZD-001, 004, 006, 007, 011, 013, 015, 016a cite it. The Mac has 32 GB. Josh's Mac answer (Oct 17): workers = 4, still one gate at a time. Recorded as Q-0114; plans citing Q-0019 read 4.
2. **Q-0018 / Q-0020 (GPU):** the "Intel UHD only" fact was about the Windows PC. The Mac has an Apple GPU (Metal, not CUDA). No change to the plan: renders stay on cloud providers and Phase 11 still builds the local worker protocol (R18). Recorded as Q-0115 (answered-agent; Josh can override); a local-render spike is a later question for Josh.
3. **Q-0063 (desktop drawing-speed measurement):** the desktop that can be measured is now the Mac, not the Intel UHD PC. The EZD-027 verdict is still decided on Josh's Surface (Q-0088, Q-0097).
4. **EZD-002 plan risk note** (Windows vs Linux CI drift): the build machine is now macOS. macOS is also case-insensitive by default, so the file-name-case risk is unchanged.
5. **(Done Oct 18)** CURRENT.md Next and Notes were Windows-only and obsolete: "restart Windows so `docker` is on PATH", the `.wslconfig` 6 GB cap, and the reminder task `ezdraft-remove-wsl-memory-cap` (Oct 15, 9:00). Replace them. Josh can delete that reminder.
6. **(Done Oct 18)** SETUP.md was Windows-only. It now has the macOS section (Homebrew, fnm with Node 22, pnpm, gh signed in as the agent account, docker-desktop cask, native Claude Code installer, `pmset` keep-awake). Mark the Windows section as no longer the build machine.
7. **(Done Oct 18)** Agent definitions listed a `PowerShell` tool and `code-reviewer.md` mentioned Windows file locks; both removed with the process v2 agent-file update.

## First Mac session, in order

1. Read `vault/handoff/CURRENT.md`, `vault/PROCESS.md` (v2) and `vault/PROCESS-EZDRAFT.md`.
2. Check on the Mac: `docker info` works; `node -v` is 22.x; `pnpm -v`; `gh auth status` shows `ironframe414-agent`; `git log -1` on `develop` matches `origin/develop`; `node vault/tools/next_ticket.mjs --check` is OK and `--next-unit` prints `build EZD-000`.
3. Items 1 to 7 are recorded (Oct 18). Nothing to record.
4. `/build-ticket EZD-000` interactively (the launcher needs the weekly ceiling, Q-0119). Approve the Playwright browser install when the build reaches EZD-007 / EZD-016a.

## Still open with Josh (unchanged by the move)

- Surface model (Settings → System → About); tests use Surface Pro 1440 × 960 until then (Q-0088).
- Not blocking Phase 0: Q-0002 (R14, R17, R18, R21, R24 stand), Q-0038 (Phase 2), Q-0089 (later phase), Q-0096 (Phase 1 password choices).
- `vault/tickets/needs-from-josh.md` (sample files, NEC access, API keys for later phases).
