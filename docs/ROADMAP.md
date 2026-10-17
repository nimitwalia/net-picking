# Roadmap (one item per PR)

## Phase 0: foundation
- [x] Set up pnpm workspace, TypeScript, Vitest
- [x] Port scheduler to packages/core with tests (valid counts, no repeats, no back-to-back)
- [x] Port scoring (win-by-2 validation) and standings with tests
- [x] Port pickTeams, finalFour and finalTeams from index.html to packages/core with tests. See docs/specs/finals.md
- [x] GitHub Actions: test on PR

### UI port to apps/free (the live app stays at the root until the owner has tested the new one on a phone)
Constraints for all items below (historical, up to the cutover): the live app was `index.html`, `sw.js`, the manifest and the icons at the repo root; item 4d moved it to apps/free. The live saved data is `localStorage` key `pickleball_tournament_v1`; browser storage is shared by every path on nimitwalia.github.io, so the preview build must use a different key until 4d.
- [x] 4a. Scaffold apps/free (Vite, `base: './'`). Copy the existing page and script across unchanged (plain JavaScript, no TypeScript conversion, no behaviour change). Preview build uses its own storage key, its own service worker scope and cache name, and a distinct app name. CI builds it. Add a 360px browser smoke test (setup, schedule, scoring, finals). No Pages changes.
- [x] 4b. GitHub Actions Pages workflow: publish the old root files byte-for-byte plus the apps/free build at `/next/`. On pull requests build only; deploy only from `main`. Then the owner switches the Pages source (Settings, Pages) from "Deploy from a branch" to "GitHub Actions"; verify the old app at the root is unchanged and `/next/` loads.
- [x] 4c. Wire packages/core into apps/free (scheduler, scoring, standings, finals). The app injects Math.random and Date.now. Add fixtures for old saved states, including the `finals.seeds` and `finals.sA`/`sB` upgrade paths in the original `load()`.
- [x] Owner phone test of `/next/` after 4c (2026-10-13): schedules and scoring as expected, PREVIEW badge shown, offline works, installs as a second home-screen icon, full tournament through finals, no layout problems. Re-test offline and install after the tie-rule item, because it changes the app again.
- [x] Tie rule at match point, shipped on `/next/` in PR #16 and phone-tested by the owner 2026-10-16: control shown, golden and win-by-2 scoring, remembered default, separate finals setting, offline, old saved tournaments read as win2 (moved here from Phase 1, owner decision 2026-10-13: ship it on `/next/` before the cutover). Golden point (default) or win by 2, with a remembered default the user can change. See docs/specs/tie-rule.md. The old-vs-new golden-master tests must run the new app with the setting on `win2`, because golden point intentionally differs from the old app.
- [x] Self-host fonts in apps/free (Bricolage Grotesque with its optical-size axis, DM Sans, DM Mono; latin woff2 from @fontsource, SIL OFL, precached by the preview service worker). No third-party requests remain in `/next/`. This resolves the Google Fonts decision for 4d: self-hosted.
- [x] 4d. Cutover (only on the owner's explicit go, never on a play day, and not the day before one): publish apps/free at the root with the same filenames (`sw.js`, manifest, icons) and switch to the live storage key `pickleball_tournament_v1`. Decision 2026-10-13: no `/legacy/` copy. Two apps on one origin would share the live storage key and the Cache Storage space (the old `sw.js` deletes every cache that is not `net-picking-v1`). Rollback is reverting the cutover PR; before the cutover, tag the last commit that has the old app at the root (`legacy-final`) so it can be restored from git. The new service worker must also delete the old `net-picking-v1` cache, and a test must load a state saved by the old app under the live key. The fonts must be self-hosted at the root as well (decision resolved: self-hosted, see the Self-host fonts item above); the root build must precache the font files in `sw.js`. Done: apps/free is published at the root (cache `net-picking-v2`, which also deletes `net-picking-v1` and `net-picking-next-*`), live keys restored, old root files removed, no `/next/` or `_next_` keys. Rollback: revert the cutover PR; the old app is restorable from tag `legacy-final`.

## Phase 0b: follow-up
- [x] CI hygiene: pin workflow runners to ubuntu-24.04 (ubuntu-latest migrates to Ubuntu 26 from 2026-10-19) and scope Pages concurrency to the deploy job only
- [x] Seeded/injectable RNG and clock in the scheduler; property tests with fixed seeds for no-repeat-partners and no-back-to-back; differential tests for checkScore and standings against the original index.html logic
- [x] CI reliability: dist is built once before the tests (root `pnpm test` and a CI step); tests and Playwright global setup never build it and fail with a clear message if it is missing or stale (two concurrent `vite build` runs broke `pnpm -r test` on the PR #19 merge); the upgrade test's poll reports the last observed worker and cache state when it times out. The suspected cause of the upgrade-test timeout (old worker re-creating net-picking-v1 after the new worker deleted it) could not be reproduced, even with a legacy worker copy whose cache write was delayed 400 ms, so sw.js is unchanged.
- [ ] CI time: the Playwright old-vs-new suite takes about 6.5 minutes (N=12 scenarios run all 800 scheduler attempts). If PR turnaround becomes a problem, move the N=12 scenarios to a manual or nightly job and keep N up to 9 on every PR.
- Note: Scheduler heuristic gap: buildSchedule(8,7) leaves 4 repeated partners where 0 is possible; log gap vs lower bound for N=8..14. Not a blocker.

## Phase 1: free v1 (finish line)
Free v1 is done when the three items below have shipped (owner decision 2026-10-18). Byes, courts and withdrawal are not part of it; they moved to Phase 2. JSON export/import and undo were cut from it (see Deferred below). Do them in this order, one item per PR.
- [ ] Rulebook link (free app): two links to the official USA Pickleball pages, in a small Rules card on Setup. No rules text, no stored PDF. See docs/specs/rulebook-link.md. The earlier "upload your own PDF" idea is deferred (see below).
- [ ] UI pass (free app only). Scope is layout and CSS, with no change to scheduling, scoring or standings logic and no colour change (colours, transitions and the premium look are Phase 2).
  - Move the four tabs (Setup, Matches, Board, Finals) into a docked bottom bar that stays on screen while the page scrolls. Hide it while a text field has focus so the phone keyboard never pushes it over the score boxes. Pad the bottom of every screen so the last row is not hidden behind it, and respect the safe-area inset on the installed home-screen app.
  - One consistent pill style for action buttons, at least 44px tall. The "Play to" tiles, stat tiles and inputs are selection tiles and fields, not action buttons, and keep their current shape.
  - Style "Make this my default" as a ghost pill on its own row, with the "Default for new tournaments" note below it. When the selected tie rule already is the default, the button is disabled and reads "Default saved". Keep the `data-tie-ui` test hooks.
  - Generate/Regenerate schedule is full width (about 52px tall) and stays inline at the end of the form, not docked, because regenerating erases entered results. "Back to matches" sits below it as a ghost pill.
  - Add a narrow test that every `<button>` rendered by the app has a `class` attribute, so an unstyled native button cannot slip in again. Update existing tests that assert the old tab position from the written rules, not from the new layout.
  - The owner checks it on a real phone, including typing a score with the keyboard open, before it merges.
- [ ] Mobile QA on iOS Safari and Android Chrome (last free item; includes the docked tab bar and the keyboard on the installed home-screen app)

### Deferred from free v1 (owner decision 2026-10-18)
- JSON export/import and undo last score. Reason: a tournament is started and finished in one sitting, per-match Update/Clear already exists, and every destructive action asks first. Revisit only if a pilot session shows a real data-loss or scorer-handover moment. See docs/specs/export-import.md (status: deferred).
- Rulebook PDF stored on the user's device (IndexedDB), with a typed edition label. Reason: heavy for a feature the group may never use; needs a real-device check of how a stored PDF opens on iOS Safari (including the home-screen app) and Android Chrome, and a PDF-rendering library if the native viewer is unusable. Copyright rules in docs/RULES_SOURCES.md still apply: the PDF is never committed, bundled or uploaded. Revisit only if the owner asks.

## Phase 2: pro (private repo)
- [ ] Next.js + Supabase, Google + email sign-in
- [ ] Pending/approved/rejected profiles, admin approval page, RLS on every table
- [ ] Import free-version JSON export (only if the free app ever gets an export; deferred, see above)
- [ ] Premium redesign (Phase 2 only; the free app keeps its current look beyond the Phase 1 UI pass): colour combinations, transitions and a premium look and feel. Starting point is the "Ledger" direction with a pastel sky-blue accent (#c9dde6), a docked bottom tab bar and hairline rows, using Bricolage Grotesque, DM Sans and DM Mono. The mockups live in the owner's Claude design canvas, not in this repo. Setup and Finals screens still need mockups before building.
- Moved from free v1 (owner decision 2026-10-18), build once for Pro:
- [ ] Optional byes (default off) and per-match ranking when byes are on. See docs/specs/byes-and-ranking.md
- [ ] Courts: floor(N/4) offered, optional court names, rounds view with resting players
- [ ] Player withdrawal and skip-next-match with undo. See docs/specs/withdrawal.md (depends on seeded RNG, byes and an undo mechanism, which free v1 no longer has)
