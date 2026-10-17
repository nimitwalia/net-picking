# Mutation harness notes (item 4c)

Six hand-applied mutations the builder (or reviewer) can apply to `apps/free` to prove the 4c tests can fail.
Apply one at a time, run the named tests, expect them to go RED, then revert.

| # | Mutation | Expected to catch it |
|---|----------|----------------------|
| a | `buildSchedule` called with a constant random (e.g. `random: () => 0.5` instead of `Math.random`) | `tests/e2e/golden-master.spec.ts` (every N: seeded random makes the old and new Matches views differ); `tests/parity/structure-s2.test.ts` (b) "each buildSchedule call injects random: Math.random" |
| b | wrong `tieSwap` passed to `finalFour` (e.g. `!S.tieSwap`, or always `false`) | `tests/e2e/golden-master.spec.ts` dedicated tie scenarios ("tie at 4th/5th cutoff ..."): the finalists differ after the swap toggle. NOT caught by structure tests and not by non-tie scenarios (no tie means the flag is inert), so the dedicated ties are the only guard |
| c | the `finals.sA/sB -> s1/s2` upgrade deleted from `migrate` | `tests/e2e/saved-state.spec.ts` fixtures `legacy-sAsB.json`, `legacy-sAsB-unscored.json`, `no-cfg-complete-legacy-finals.json` (champion score and re-saved JSON); `tests/parity/structure-s4.test.ts` migrate block byte-equal to the legacy fixture's (tests/fixtures/legacy/index.html, the old root app) |
| d | entry JS removed from the service worker `FILES` | `tests/parity/sw-s5.test.ts` ("entry JS is listed in the precache FILES"); `tests/e2e/offline.spec.ts` (entry not in the new `net-picking-v<n>` cache, and the offline reload fails) |
| e | a local `function standings` re-added to `main.js` with its own body (e.g. `pts+=3`) | `tests/parity/structure-s3.test.ts` ("a local standings only delegates", "no scoring arithmetic anywhere"); also S2/S4 equivalents for other moved functions |
| f | `+3` / `-1` swapped in an adapter | `tests/parity/structure-s3.test.ts` (adapter must not contain `pts+=3`/`pts-=1`, no `pts` arithmetic in `main.js`); `tests/e2e/golden-master.spec.ts` (Board text and `pts` in saved state differ for every scenario); packages/core tests cover the core arithmetic |

## Dry run done while writing the tests

Mutations a, b, c were applied to a scratch copy of the built app (the inline script of the then-current byte-copy, served
from outside the repo and selected with `NEW_BASE_OVERRIDE=<url>`); a, b were caught by golden-master, c by saved-state.
Mutations a, e, b (structure side) were applied to a scratch `main.js` (selected with `MAIN_JS_UNDER_TEST=<file>`,
`INDEX_UNDER_TEST=<file>`): a and e were caught by structure-s2 / structure-s3; b is correctly not a structure concern.
d and f were not dry-run (they need the S5 `sw.js` / a real `main.js`).

## Tie-rule item (S4): mutations run, with real results

Each mutation was applied by hand, `vite build` re-run (the Playwright global setup does not rebuild when only `src/` changes, so a stale `dist/` would hide it), the named tests run, then reverted (`git diff -- apps/free/src packages/core/src` empty afterwards).

| # | Mutation | Failing tests |
|---|----------|---------------|
| a | golden branch of `checkScore` (packages/core/src/scoring.ts) no longer rejects scores above `to` (12-10 accepted) | core `tie-rule.test.ts`: 9 failed (valid set exactly, named rejections, message test, for each to 7/11/15/21); e2e `tie-scoring` "group match, golden, to 7 ... grid" and "named cases, to 11" |
| b | golden branch rejects `a < b` (10-11 rejected, argument order) | core `tie-rule.test.ts`: 5 failed (valid set exactly x4, "accepts 11-10 and 10-11"); e2e `tie-defaults` "new tournament (empty storage) defaults to golden", `tie-scoring` "named cases, to 11" |
| c | `tieOf` treats a missing value as golden | core tests pass (the app helper is not in core); e2e `tie-defaults`: 8 legacy fixtures "behaves as win2 ..." and "legacy save is win2 even with no prefs" (9 failed) |
| d | `makeDefault` also writes `tie` into `S.rules` and saves | e2e `tie-defaults` "changing the remembered default never alters a tournament in progress; reload keeps both" |
| e | hard-coded "win by 2" in the per-match rule line (`.rhint`) under golden | e2e `tie-text` "golden: no win by 2 ... anywhere" and "golden: scoring hint, per-match rule line ..."; `smoke-golden` x4 |
| f | `saveScore` uses `S.rules` for the final instead of `S.finals.rules` | e2e `tie-scoring` "final follows its own setting" 8 of 16 (the two mixed combinations for each to) |
| g | try/catch removed around the prefs read | e2e `tie-defaults`: "prefs getItem throws ...", "all localStorage access throws ...", corrupt prefs "garbage" and "" (JSON.parse throws); these time out because the app fails to load |

## Cutover 4d: identity and upgrade mutations

Applied to a throwaway copy of `apps/free/dist` (never to the repo), served with the Playwright harness
(`NEW_BASE_OVERRIDE` for the old-vs-new specs; the upgrade and same-origin specs read `apps/free/dist` directly, so
those were run against a temporarily edited dist and then rebuilt). Run results (all mutations were caught; dist was restored afterwards): g: upgrade.spec (v1 never deleted), sw-behaviour x2; h: upgrade.spec (manifest step), built-root x2; i: upgrade.spec (`other-app-v1` gone), sw-behaviour x2, built-root (prefix); j (main.js key switched to the `_next_` key): retired-keys x2, built-root x2; k (Google Fonts link): same-origin, fonts-runtime (a), built-root x2.

| # | Mutation | Expected to catch it |
|---|----------|----------------------|
| g | `sw.js` no longer deletes `net-picking-v1` | `tests/e2e/upgrade.spec.ts` (the v1 cache never disappears); `tests/parity/sw-behaviour.test.ts`, `sw-s5.test.ts` |
| h | manifest `name` is "Net-picking Next" | `tests/e2e/upgrade.spec.ts` (manifest step); `tests/parity/cutover-parity.test.ts`; `scripts/tests/built-root.test.ts` |
| i | `sw.js` deletes every cache that is not its own (drops the ownership check) | `tests/e2e/upgrade.spec.ts` (`other-app-v1` must survive); `tests/parity/sw-behaviour.test.ts` ("only deletes what it owns") |
| j | the app also reads `pickleball_tournament_next_v1` | `tests/e2e/retired-keys.spec.ts`; `tests/parity/structure*.test.ts` |
| k | a Google Fonts link or other third-party URL in `index.html` | `scripts/tests/built-root.test.ts`; `tests/e2e/same-origin.spec.ts`; `tests/e2e/fonts-runtime.spec.ts` (a) |

## CI reliability: build-once and fail-loudly mutations

Each mutation was applied by hand to the repo, only the named vitest file was run (`cd scripts && pnpm vitest run <file>`), and the change was reverted with `git checkout` (`git status` clean afterwards). All were caught.

| # | Mutation | Test file | Result |
|---|----------|-----------|--------|
| a | `execFileSync('pnpm', ['--filter','@net-picking/free','build'])` added to `apps/free/tests/e2e/global-setup.ts` | `scripts/tests/no-build-in-tests.test.ts` | RED: "no scanned file spawns a build" names `apps/free/tests/e2e/global-setup.ts` |
| b | `spawnSync('npx', ['vite','build'])` added to `apps/free/playwright.config.ts` | `no-build-in-tests.test.ts` | RED, names `apps/free/playwright.config.ts` |
| c | `execSync('pnpm run build')` added to `scripts/tests/built-root.test.ts` | `no-build-in-tests.test.ts` | RED, names `scripts/tests/built-root.test.ts` |
| d | stale check never fires (`if (false && newest.t > built)`) in `scripts/tests/require-dist.ts` | `scripts/tests/require-dist.test.ts` | RED: every "STALE when ... is newer than dist" case (7 sources) fails |
| e | same mutation in `apps/free/tests/e2e/require-dist.ts` | `require-dist.test.ts` | RED: same 7 STALE cases fail |
| f | missing check disabled (`if (false)`) in `scripts/tests/require-dist.ts` | `require-dist.test.ts` | RED: both MISSING cases, plus the "two copies stay in step" check |
| g | root `package.json` test reordered to `pnpm -r test && pnpm --filter @net-picking/free build` | `scripts/tests/ci-build-order.test.ts` | RED: "builds apps/free first, then runs pnpm -r test, in that order" |
| h | ci.yml build step deleted | `ci-build-order.test.ts` | RED: 3 tests (step exists/order, exactly one build, same `if:`) |
| i | ci.yml build step moved after `pnpm -r test` | `ci-build-order.test.ts` | RED: 2 tests (order, exactly one build before test) |
| j | ci.yml build step loses its `if:` | `ci-build-order.test.ts` | RED: "same if: condition" |
| k | ci.yml `runs-on` changed to `ubuntu-latest` | `ci-build-order.test.ts` | RED: "still pins ubuntu-24.04" |
| l | `requireFreshDist();` call removed from `global-setup.ts` | `ci-build-order.test.ts` | RED: "global-setup.ts imports and calls requireFreshDist" |

Note on the helper tests: `requireFreshDist` computes the repo root from its own file location, so `require-dist.test.ts` copies each helper byte-for-byte into a temp tree at the same relative path and imports it from there. Missing, fresh, stale (by `utimes`) and fresh-after-refresh are tested without touching the real `apps/free/dist` or real sources.

Upgrade poll (no automated test): the builder checked by hand that a forced failure of the poll in `tests/e2e/upgrade.spec.ts` reports the last observed worker and cache state (and the server request log) on timeout. That is a manual check, not covered by any test.
