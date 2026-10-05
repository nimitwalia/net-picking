# Spec: optional byes and per-match ranking

Status: decided by the owner. Do not change the rules below without asking.

## Byes
- Setup gets an optional switch: "Allow some players to play fewer matches". Default OFF.
- OFF: behaviour is exactly as today. Valid matches per player m: N*m divisible by 4 and m <= N-1.
- ON: any m is allowed. Each match uses 4 players; the rest sit out (a bye). Resting is shared as evenly as possible. Match counts across players differ by at most 1.

## Ranking
- Byes OFF: rank by total points (win +3, loss -1), existing tiebreaks. The live leaderboard is unchanged. This path must stay identical to the original logic in the old index.html (differential test).
- Byes ON (or after any withdrawal, see withdrawal.md): rank by points per match = (3*wins - losses) / matches played.
  - Compare fractions exactly by cross-multiplication (a.pts * b.played vs b.pts * a.played). No floating-point comparison.
  - Tiebreaks in order: more wins; point difference per match; points scored per match; name.
- The 4th-vs-5th tie check and the finals team-balancing strength score use the same ranking as the mode in force.
- UI: add a "Played" column; show "ranked by points per match" when that mode is on; mark the table "provisional" until all matches are done.
- Known limitation, accepted: players who rest more face fewer opponents. Not corrected.

## Tests required
- Property tests with fixed seeds: counts differ by at most 1 with byes on; everyone equal with byes off.
- At final standings with equal match counts, per-match order equals total-points order.
- Exact-fraction tie handling.
