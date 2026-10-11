# Spec: tie rule at match point (golden point or win by 2)

Status: decided by the owner. Do not change the rules below without asking.

Golden point is the owner's house rule, not an official rule. The 2026 USA Pickleball rulebook (Rule 15.C) says all tournament scoring options are win by two, except win by one is allowed for team play. See docs/RULES_SOURCES.md. The app must never present golden point as the official rule.

## Setting
- Name: "Tie at match point". Two values: `golden` (label "Golden point") and `win2` (label "Win by 2 (deuce)").
- It sits with the other scoring rules (scoring type, play to). The final already has its own scoring card, so the final can use a different value from the group stage.
- Default for new tournaments: `golden`.
- The user can change the remembered default to `win2` in the app. It is a preference stored on the device and affects only tournaments created afterwards, never one already saved.
- A saved tournament from before this setting existed has no value. Treat a missing value as `win2` (unchanged behaviour).

## Valid final scores (`to` is the points to play: 7, 11, 15 or 21)
- `win2`: exactly the current `checkScore` rules. Behaviour and messages unchanged (differential test against the original).
- `golden`: a score (a, b) is valid if and only if both are whole numbers, exactly one side has exactly `to`, and the other side has 0 to `to - 1`. Order of entry does not matter (11-10 and 10-11 are both valid for `to` = 11).
  - Invalid examples for `to` = 11: 10-10 (a tie is never a result), 12-10 (the game ends at 11), 9-8 (nobody reached 11), 11-11.
- Games are never ended early. There is no time-cap rule.
- Error messages for `golden` must name the target and the rule, and say what a valid score looks like.

## Text in the UI
- Every place that currently says "win by 2" (the scoring hint, the match header line, the final's scoring card, error messages) must follow the setting.

## Out of scope
- Standings, ranking and finals logic. A golden-point win such as 11-10 counts as a win with point difference 1, like any other.

## Tests required
- For each `to` in 7, 11, 15, 21: the set of valid `golden` scores is exactly {(to, k) and (k, to) for k from 0 to to-1}. Everything else is rejected.
- `win2` is identical to the original `checkScore` (differential).
- A saved tournament with no tie-rule value behaves as `win2`.
- Changing the remembered default does not change an existing tournament.
