# Roadmap (one item per PR)

## Phase 0: foundation
- [x] Set up pnpm workspace, TypeScript, Vitest
- [x] Port scheduler to packages/core with tests (valid counts, no repeats, no back-to-back)
- [x] Port scoring (win-by-2 validation) and standings with tests
- [x] Port pickTeams, finalFour and finalTeams from index.html to packages/core with tests. See docs/specs/finals.md
- [x] GitHub Actions: test on PR

### UI port to apps/free (the live app stays at the root until the owner has tested the new one on a phone)
Constraints for all items below: the live app is `index.html`, `sw.js`, the manifest and the icons at the repo root. Do not move, rename or modify them except in item 4d, which explicitly authorises it. The live saved data is `localStorage` key `pickleball_tournament_v1`; browser storage is shared by every path on nimitwalia.github.io, so the preview build must use a different key until 4d.
- [x] 4a. Scaffold apps/free (Vite, `base: './'`). Copy the existing page and script across unchanged (plain JavaScript, no TypeScript conversion, no behaviour change). Preview build uses its own storage key, its own service worker scope and cache name, and a distinct app name. CI builds it. Add a 360px browser smoke test (setup, schedule, scoring, finals). No Pages changes.
- [x] 4b. GitHub Actions Pages workflow: publish the old root files byte-for-byte plus the apps/free build at `/next/`. On pull requests build only; deploy only from `main`. Then the owner switches the Pages source (Settings, Pages) from "Deploy from a branch" to "GitHub Actions"; verify the old app at the root is unchanged and `/next/` loads.
- [x] 4c. Wire packages/core into apps/free (scheduler, scoring, standings, finals). The app injects Math.random and Date.now. Add fixtures for old saved states, including the `finals.seeds` and `finals.sA`/`sB` upgrade paths in the original `load()`.
- [x] Owner phone test of `/next/` after 4c (2026-10-13): schedules and scoring as expected, PREVIEW badge shown, offline works, installs as a second home-screen icon, full tournament through finals, no layout problems. Re-test offline and install after the tie-rule item, because it changes the app again.
- [x] Tie rule at match point, shipped on `/next/` in PR #16 and phone-tested by the owner 2026-10-16: control shown, golden and win-by-2 scoring, remembered default, separate finals setting, offline, old saved tournaments read as win2 (moved here from Phase 1, owner decision 2026-10-13: ship it on `/next/` before the cutover). Golden point (default) or win by 2, with a remembered default the user can change. See docs/specs/tie-rule.md. The old-vs-new golden-master tests must run the new app with the setting on `win2`, because golden point intentionally differs from the old app.
- [x] Self-host fonts in apps/free (Bricolage Grotesque with its optical-size axis, DM Sans, DM Mono; latin woff2 from @fontsource, SIL OFL, precached by the preview service worker). No third-party requests remain in `/next/`. This resolves the Google Fonts decision for 4d: self-hosted.
- [ ] 4d. Cutover (only on the owner's explicit go, never on a play day, and not the day before one): publish apps/free at the root with the same filenames (`sw.js`, manifest, icons) and switch to the live storage key `pickleball_tournament_v1`. Decision 2026-10-13: no `/legacy/` copy. Two apps on one origin would share the live storage key and the Cache Storage space (the old `sw.js` deletes every cache that is not `net-picking-v1`). Rollback is reverting the cutover PR; before the cutover, tag the last commit that has the old app at the root (`legacy-final`) so it can be restored from git. The new service worker must also delete the old `net-picking-v1` cache, and a test must load a state saved by the old app under the live key. The fonts must be self-hosted at the root as well (decision resolved: self-hosted, see the Self-host fonts item above); the root build must precache the font files in `sw.js`.

## Phase 0b: follow-up
- [x] CI hygiene: pin workflow runners to ubuntu-24.04 (ubuntu-latest migrates to Ubuntu 26 from 2026-10-19) and scope Pages concurrency to the deploy job only
- [x] Seeded/injectable RNG and clock in the scheduler; property tests with fixed seeds for no-repeat-partners and no-back-to-back; differential tests for checkScore and standings against the original index.html logic
- [ ] CI time: the Playwright old-vs-new suite takes about 6.5 minutes (N=12 scenarios run all 800 scheduler attempts). If PR turnaround becomes a problem, move the N=12 scenarios to a manual or nightly job and keep N up to 9 on every PR.
- Note: Scheduler heuristic gap: buildSchedule(8,7) leaves 4 repeated partners where 0 is possible; log gap vs lower bound for N=8..14. Not a blocker.

## Phase 1: free v1
- [ ] JSON export/import + undo last score
- [ ] Optional byes (default off) and per-match ranking when byes are on. See docs/specs/byes-and-ranking.md
- [ ] Courts: floor(N/4) offered, optional court names, rounds view with resting players
- [ ] Player withdrawal and skip-next-match with undo. See docs/specs/withdrawal.md (depends on seeded RNG, byes, undo)
- [ ] Rulebook reference screen: a link to the official rules page, plus an optional copy saved on the user's own device. The user uploads their own PDF, it is stored in the browser (IndexedDB) and is never uploaded, bundled or committed (copyright, see docs/RULES_SOURCES.md). The user types the edition label; the app does not read the PDF or derive any rules from it. First test how a stored PDF opens on iOS Safari (including the home-screen app) and Android Chrome; add a PDF-rendering library only if the native viewer is unusable
- [ ] Mobile QA on iOS Safari and Android Chrome

## Phase 2: pro (private repo)
- [ ] Next.js + Supabase, Google + email sign-in
- [ ] Pending/approved/rejected profiles, admin approval page, RLS on every table
- [ ] Import free-version JSON export
