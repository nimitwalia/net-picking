# Spec: player withdrawal mid-tournament

Status: decided by the owner. Do not change the rules below without asking.

## Principles
- Played matches are history and never change. A withdrawn player's results still stand for their opponents.
- A withdrawal is a recorded event and must be undoable (restores the previous schedule).
- Tournament state = seed + players + settings + events (scores, withdrawals, skips). Undo, backup and restore rely on this. Requires the seeded RNG.

## Two actions
1. Skip next match (temporary): the player gets a bye for their next match and returns. No rescheduling beyond that.
2. Withdraw (permanent).

## On withdrawal: filling vacated slots
For each unplayed match containing the leaver, in schedule order:
1. Candidates = active players not already in that match.
2. Choose the candidate with the fewest TOTAL matches = played + planned (planned includes slots already filled by earlier substitutions in this same withdrawal). Recompute after each substitution.
3. If candidates tie on total matches, choose the closest-ranked player BELOW the leaver (lower standing = worse position). The leaver's rank is taken at the moment of withdrawal, using the ranking mode in force.
   - If nobody is ranked below (leaver is last), use the closest player ABOVE.
   - If the closest candidate is excluded (already in that match), move to the next one further below.
4. Back-to-back matches and repeated partners are tolerated here: the rule order above wins. This is an exceptional situation (owner decision).
5. If no valid candidate exists for a slot, stop and ask the owner. Do not guess.

## After withdrawal
- Ranking switches to points per match (see byes-and-ranking.md), with a message saying why.
- The leaver stays listed, greyed: "withdrew after N matches". They cannot qualify for the finals; the top four come from active players only.
- The Matches view shows a note that the schedule was adjusted and which matches changed.
- Confirmation dialog before applying, e.g. "3 upcoming matches get a substitute; Rahul gets 1 extra match."

## Match in progress when a player leaves
Owner chooses at that moment: (a) void the match and fill it by the rules above (default), or (b) record as a forfeit. Do not assume official pickleball rules; docs/RULES_SOURCES.md has the source if one is added.

## Finals
- Withdrawal before finals teams are set: recompute from active players.
- Withdrawal after finals teams are set but before play: next-ranked active player takes the place; rebalance teams.
- Withdrawal after the finals match has started: manual decision by the owner.

## Tests required (tester agent, from this spec, not from the implementation)
- Results of played matches are unchanged by a withdrawal.
- Fewest-total-matches rule, including recomputation after each substitution.
- Tie fallback: closest below; closest above when leaver is last; skipping excluded candidates.
- Leaver never appears in finals; undo restores the exact prior schedule.
