# Instructions for coding agents (read first)

Project: Net-picking, a pickleball tournament app. See docs/PLAN.md and docs/ROADMAP.md.

## Current state
The live free app is `apps/free`, built by GitHub Actions and published at the site root (https://nimitwalia.github.io/net-picking/). The old single-file app exists only in git, at tag `legacy-final`. Do NOT move or rename `sw.js`, the manifest or the icons (now `apps/free/public/sw.js`, `apps/free/public/manifest.webmanifest`, `apps/free/public/icon-*.png`, `apple-touch-icon.png`), or the live URL and installed home-screen apps break. The saved tournament lives in `localStorage` key `pickleball_tournament_v1`; keep it and the cache name scheme (`net-picking-v<n>`) stable.

## Rules
1. Work on ONE roadmap item at a time. Do not start the next without being asked.
2. All scheduling, scoring and standings logic lives in `packages/core` as pure TypeScript. No DOM, no localStorage, no network there.
3. Every change to core ships with unit tests. Run the tests before saying a task is done.
4. Do not invent pickleball rules. Rules content must come from the official rulebook the owner links in docs/RULES_SOURCES.md. If unsure, stop and ask.
5. Free app: no backend, no analytics, no accounts, no network calls other than loading the page.
6. Never commit secrets. No keys in client code.
7. Keep the UI usable on a 360px-wide phone. Black theme with cream/pastel UI elements.
8. Small commits with clear messages. Open a PR per roadmap item.

## Core behaviour that must not regress
- Valid matches-per-player: N*m divisible by 4 (unless byes enabled) and m <= N-1.
- Scheduler avoids repeated partners first, then back-to-back matches, then repeated opponents, in that priority (cost weights 20, 15, 3).
- Win +3 / loss -1 per player. Scores must follow the chosen tie rule against the chosen points-to-play: `win2` (win by 2, identical to the original `checkScore`) or `golden` (golden point, the owner's house rule, default for new tournaments; see docs/specs/tie-rule.md). A saved tournament with no tie-rule value behaves as `win2`.
- Courts offered = floor(players/4).
