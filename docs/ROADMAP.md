# Roadmap (one item per PR)

## Phase 0: foundation
- [x] Set up pnpm workspace, TypeScript, Vitest
- [x] Port scheduler to packages/core with tests (valid counts, no repeats, no back-to-back)
- [x] Port scoring (win-by-2 validation) and standings with tests
- [x] Port pickTeams, finalFour and finalTeams from index.html to packages/core with tests. See docs/specs/finals.md
- [x] GitHub Actions: test on PR

### UI port to apps/free (the live app stays at the root until the owner has tested the new one on a phone)
Constraints for all items below: the live app is `index.html`, `sw.js`, the manifest and the icons at the repo root. Do not move, rename or modify them except in item 4d, which explicitly authorises it. The live saved data is `localStorage` key `pickleball_tournament_v1`; browser storage is shared by every path on nimitwalia.github.io, so the preview build must use a different key until 4d.
- [ ] 4a. Scaffold apps/free (Vite, `base: './'`). Copy the existing page and script across unchanged (plain JavaScript, no TypeScript conversion, no behaviour change). Preview build uses its own storage key, its own service worker scope and cache name, and a distinct app name. CI builds it. Add a 360px browser smoke test (setup, schedule, scoring, finals). No Pages changes.
- [ ] 4b. GitHub Actions Pages workflow: publish the old root files byte-for-byte plus the apps/free build at `/next/`. On pull requests build only; deploy only from `main`. Then the owner switches the Pages source (Settings, Pages) from "Deploy from a branch" to "GitHub Actions"; verify the old app at the root is unchanged and `/next/` loads.
- [ ] 4c. Wire packages/core into apps/free (scheduler, scoring, standings, finals). The app injects Math.random and Date.now. Add fixtures for old saved states, including the `finals.seeds` and `finals.sA`/`sB` upgrade paths in the original `load()`.
- [ ] Owner phone test of `/next/`: iOS Safari (and Android Chrome if available), install as a second home-screen icon, run a full mock tournament, compare scoring and standings with the old app, test offline and a 360px width.
- [ ] 4d. Cutover (only on the owner's explicit go, never on a play day): publish apps/free at the root with the same filenames (`sw.js`, manifest, icons), switch to the live storage key `pickleball_tournament_v1`, keep the old app at `/legacy/`. Rollback is reverting the cutover PR.

## Phase 0b: follow-up
- [x] Seeded/injectable RNG and clock in the scheduler; property tests with fixed seeds for no-repeat-partners and no-back-to-back; differential tests for checkScore and standings against the original index.html logic
- Note: Scheduler heuristic gap: buildSchedule(8,7) leaves 4 repeated partners where 0 is possible; log gap vs lower bound for N=8..14. Not a blocker.

## Phase 1: free v1
- [ ] JSON export/import + undo last score
- [ ] Optional byes (default off) and per-match ranking when byes are on. See docs/specs/byes-and-ranking.md
- [ ] Courts: floor(N/4) offered, optional court names, rounds view with resting players
- [ ] Player withdrawal and skip-next-match with undo. See docs/specs/withdrawal.md (depends on seeded RNG, byes, undo)
- [ ] Mobile QA on iOS Safari and Android Chrome

## Phase 2: pro (private repo)
- [ ] Next.js + Supabase, Google + email sign-in
- [ ] Pending/approved/rejected profiles, admin approval page, RLS on every table
- [ ] Import free-version JSON export
