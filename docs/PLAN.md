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
1. Free v1: backup/restore + undo, any number of players (byes), multiple named courts and rounds.
2. Free v1 hardening: real-group pilot for 2-3 sessions, fix what breaks.
3. Pro alpha: auth + approval + cloud save, your group only.
4. Pro features, one at a time: ratings, balanced pairing, Mexicano, stats/awards, live scorer, fee splitter, rules feed.

## Decision gates
- Do not start Pro until Free v1 has survived real sessions.
- Do not add Apple/phone sign-in until a user actually asks.
- Rules feed is admin-curated with source links. No AI-written rules.
