# Spec: finals selection and team pairing

Status: decided by the owner. Do not change the rules below without asking.

All functions are pure and live in `packages/core`. No storage, DOM or network access. Rows use the existing `StandingRow` type from `packages/core/src/standings.ts` (fields `name`, `p`, `w`, `l`, `pts`, `diff`, `pf`). Input rows are leaderboard rows already sorted; these functions never re-sort.

## finalFour(rows, tieSwap)
- Returns the first 4 rows.
- If `tieSwap` is true AND `tieAtCutoff(rows)` is true, the 4th row is replaced by `rows[4]`.
- `tieSwap` is ignored when there is no tie at the cutoff.
- Fewer than 4 rows: throw a clear `Error`.
- Known quirk, kept on purpose: with a 3-way tie for 4th, only `rows[3]` and `rows[4]` can be swapped. Do not fix.

## tieAtCutoff(rows)
- Already implemented in `standings.ts`; behaviour is unchanged and is restated here.
- False if fewer than 5 rows.
- Otherwise true iff `rows[3]` and `rows[4]` are equal on `pts`, `w`, `diff` and `pf`.

## pickTeams(four)
- Strength of a row = `pts + diff * 0.001`.
- Candidate pairings, in this order (indices into `four`):
  1. [0,3] v [1,2]
  2. [0,2] v [1,3]
  3. [0,1] v [2,3]
- Choose the pairing with the smallest absolute difference of summed team strengths.
- A later candidate replaces the current best only if its difference is smaller by more than 1e-9, so exact ties keep the earliest pairing.
- Returns `{A, B}`, each holding 2 rows.
- Fewer than 4 rows: throw a clear `Error`.

## resolveFinalTeams(finals)
- If `finals.teams` exists, return `{A: finals.teams.A, B: finals.teams.B}`.
- Otherwise use legacy `finals.seeds` (array `q`): `{A: [q[0], q[3]], B: [q[1], q[2]]}`.
- Pure: it reads only its argument.

## Out of scope
- Effect of byes / per-match ranking on finals balance. Revisit in the byes item (see byes-and-ranking.md).
