# Plan

## Two products, one engine
| | Free | Pro |
|---|---|---|
| Hosting | GitHub Pages / any static host | Vercel |
| Backend | none | Supabase (Postgres + Auth, row-level security) |
| Access | open | sign-up + admin approval |
| Repo | public (`net-picking`) | private (`net-picking-pro`), imports `packages/core` |
| Licence | MIT | proprietary |

## Sequence
0. Foundation: extract core into `packages/core` with tests; Vite + TypeScript for the free app.
1. Free v1: backup/restore + undo, a rulebook reference screen, a UI pass (docked bottom tab bar, consistent pill buttons) and mobile QA. Byes, named courts and withdrawal moved to Pro (decision 2026-10-18).
2. Free v1 hardening: real-group pilot for 2-3 sessions, fix what breaks. This runs alongside the start of the Pro build.
3. Pro alpha: auth + approval + cloud save, your group only.
4. Pro features, one at a time: byes, named courts and rounds view, player withdrawal, ratings, balanced pairing, Mexicano, stats/awards, live scorer, fee splitter, rules feed.

## Decision gates
- The Pro build may start once Free v1 has shipped. No user gets into Pro until Free v1 has survived 2-3 real sessions, because those sessions are the evidence that the shared `packages/core` is right (decision 2026-10-18; this replaces "do not start Pro until...").
- The premium visual redesign (colours, transitions, premium look) is Pro only. The free app gets only the Phase 1 UI pass.
- Do not add Apple/phone sign-in until a user actually asks.
- Rules feed is admin-curated with source links. No AI-written rules.
