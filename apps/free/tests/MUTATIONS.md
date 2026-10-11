# Mutation harness notes (item 4c)

Six hand-applied mutations the builder (or reviewer) can apply to `apps/free` to prove the 4c tests can fail.
Apply one at a time, run the named tests, expect them to go RED, then revert.

| # | Mutation | Expected to catch it |
|---|----------|----------------------|
| a | `buildSchedule` called with a constant random (e.g. `random: () => 0.5` instead of `Math.random`) | `tests/e2e/golden-master.spec.ts` (every N: seeded random makes the old and new Matches views differ); `tests/parity/structure-s2.test.ts` (b) "each buildSchedule call injects random: Math.random" |
| b | wrong `tieSwap` passed to `finalFour` (e.g. `!S.tieSwap`, or always `false`) | `tests/e2e/golden-master.spec.ts` dedicated tie scenarios ("tie at 4th/5th cutoff ..."): the finalists differ after the swap toggle. NOT caught by structure tests and not by non-tie scenarios (no tie means the flag is inert), so the dedicated ties are the only guard |
| c | the `finals.sA/sB -> s1/s2` upgrade deleted from `migrate` | `tests/e2e/saved-state.spec.ts` fixtures `legacy-sAsB.json`, `legacy-sAsB-unscored.json`, `no-cfg-complete-legacy-finals.json` (champion score and re-saved JSON); `tests/parity/structure-s4.test.ts` migrate block byte-equal to the root's |
| d | entry JS removed from the service worker `FILES` | `tests/parity/sw-s5.test.ts` ("entry JS is listed in the precache FILES"); `tests/e2e/offline.spec.ts` (entry not in cache `net-picking-next-v2`, and the offline reload fails) |
| e | a local `function standings` re-added to `main.js` with its own body (e.g. `pts+=3`) | `tests/parity/structure-s3.test.ts` ("a local standings only delegates", "no scoring arithmetic anywhere"); also S2/S4 equivalents for other moved functions |
| f | `+3` / `-1` swapped in an adapter | `tests/parity/structure-s3.test.ts` (adapter must not contain `pts+=3`/`pts-=1`, no `pts` arithmetic in `main.js`); `tests/e2e/golden-master.spec.ts` (Board text and `pts` in saved state differ for every scenario); packages/core tests cover the core arithmetic |

## Dry run done while writing the tests

Mutations a, b, c were applied to a scratch copy of the built preview (the inline script of the current byte-copy, served
from outside the repo and selected with `NEW_BASE_OVERRIDE=<url>`); a, b were caught by golden-master, c by saved-state.
Mutations a, e, b (structure side) were applied to a scratch `main.js` (selected with `MAIN_JS_UNDER_TEST=<file>`,
`INDEX_UNDER_TEST=<file>`): a and e were caught by structure-s2 / structure-s3; b is correctly not a structure concern.
d and f were not dry-run (they need the S5 `sw.js` / a real `main.js`).
