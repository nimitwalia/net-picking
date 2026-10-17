# Export / import (free app)

Decided 2026-10-18. Undo is NOT part of this item: every match already has Update score and Clear, and every destructive action (regenerate, new tournament, reset final, editing a group score that resets the finals) already asks first. Export is the safety net.

## Purpose
Back up the current tournament to a file and restore it on the same or another device. The file is also the hand-over format for the Pro app (ROADMAP Phase 2, "Import free-version JSON export"), so the envelope below is a contract. Changing the tournament shape later needs a `version` bump and a migration.

## File
- UTF-8 JSON, named `net-picking-YYYY-MM-DD.json` (device-local date).
- Envelope: `{ "format": "net-picking-export", "version": 1, "exportedAt": "<ISO 8601>", "tournament": <object> }`.
- `tournament` is exactly the object the app stores under `localStorage` key `pickleball_tournament_v1`. No new schema is invented.
- Not exported: the remembered default tie rule (`pickleball_prefs_v1`) and any unsaved score drafts. Importing never changes the default tie rule.

## Export
- Enabled only when there is something to export (at least one player entered or a schedule exists).
- Works offline. No network call. The file is built in the browser and downloaded through a link, the same way the final-result image already is.

## Import
- A file picker accepting `.json`. The file is read in the browser only. No network call.
- All checks run before anything is changed. If any check fails, nothing is applied and the dialog names the reason in plain words:
  1. Not valid JSON.
  2. `format` is not `net-picking-export`.
  3. `version` missing, not a whole number, or higher than the app supports ("made by a newer version of Net-picking").
  4. File larger than 1 MB.
  5. `tournament` missing or not an object.
  6. A recorded score that is not valid under that tournament's own saved rules (points to play and tie rule), including the finals. The same rule as `checkScore`; a saved tournament with no tie rule is read as `win2`.
  7. A match that names a player who is not in the player list, or a player count outside 4 to 32.
- Only the known top-level keys of the tournament are copied into the app state. Unknown keys are ignored. A key named `__proto__` or `constructor` anywhere in the file fails the import.
- A tournament shaped like an old saved state (legacy `finals.seeds`, `finals.sA`/`sB`, or missing `cfg`/`rules`/`fcfg`) is accepted and upgraded by the same code path as loading it from `localStorage`.
- If a tournament already exists on the device (players entered or a schedule), ask first: "This replaces your current tournament (N players, M of K matches done). It cannot be undone, so export it first if you want to keep it." Cancel leaves everything untouched. If nothing exists, import applies at once.
- On success the app shows the imported tournament on Matches if it has a schedule, otherwise on Setup, and saves it under `pickleball_tournament_v1`.
- Player names and all imported text are shown escaped, never as HTML.

## Must not change
`sw.js`, the manifest, the icons, the cache name `net-picking-v2` and the localStorage keys. No new localStorage keys. No new network requests.

## Invariants the tests must check
1. Round trip: export, then import on a fresh device, reproduces the same players, schedule, results, standings and finals.
2. Importing a file equals loading the same tournament from `localStorage` (including the legacy shapes).
3. Every check in the Import list rejects with no change to the saved tournament, tested with one bad file per check.
4. A name such as `<img src=x onerror=alert(1)>` renders as text.
5. Cancelling the replace dialog changes nothing.
6. Undo does not exist: no undo control is added.

## Real-device check (owner, before merge)
Export and import on an iPhone installed to the home screen and on Android Chrome. If a file cannot be saved or picked on the installed iPhone app, stop and report. Do not add a copy/paste fallback without a decision.
