# Pro foundations: first slice (organiser account + share link)

Status: DRAFT for owner approval. Decided with the owner 2026-10-23. Nothing here is built.

## What Pro's first slice is
One thing a player can see that the free app cannot give them: **live standings on their own phone**.

1. The organiser signs in, creates a tournament and enters scores, exactly as in the free app.
2. The app gives the organiser a **share link**. Players open it on their own phones and see the schedule and live standings. No account. They cannot edit.
3. Accounts exist only for organisers. Server storage exists only to make that link work.

Decisions (owner, 2026-10-23):
- Only the organiser can edit. Players are read-only.
- The share link is open to anyone who has it (no password).
- Sign-in: Google and email magic link, both.
- Pro starts from a clean slate. No import from the free app, no migration.
- Payments are NOT in this slice. The pricing model (annual plan or per-tournament pass; the owner first thought of a one-time price) is undecided and stays out of the spec. See "Open decisions".

## Out of scope for this slice
Payments or billing; byes, courts, withdrawal, ratings, Mexicano or any other Phase 2 feature; the premium redesign (use the free app's look); viewer accounts, chat or comments; import from the free app; Apple or phone sign-in (docs/PLAN.md gate); any change to `apps/free`.

## Rules that carry over unchanged
- All scheduling, scoring and standings logic comes from `packages/core`. Pro must not re-implement any of it. The share page computes standings with core from the stored tournament, so the organiser's screen and the players' screen cannot disagree.
- Win +3 / loss -1, the tie rule (`golden` or `win2`) per tournament, courts = floor(players/4), and the scheduler weights stay as in AGENTS.md.
- No pickleball rules are invented (AGENTS.md rule 4).
- No secrets in client code (rule 6). The 360px phone width and the black theme with cream/pastel elements still apply (rule 7).

## Design (decisions the builder follows; the owner approves them here)
**Data.** One row per tournament: `id`, `owner_id` (the signed-in user), `state` (the same tournament object the free app saves, as JSON, so core reads it directly), `share_token`, `sharing_enabled`, `version`, `created_at`, `updated_at`. Standings and schedule are not stored; they are computed from `state` by core.

**Who can do what.**
- Organiser (signed in): create, read, update and delete only their own tournaments. Enforced by row-level security on the table, not only in the UI.
- Anyone with a link: read one tournament only. The public page never gets table-level read access. It reads through a server route or a database function that takes a token and returns that one tournament's `state` (and nothing else), only while `sharing_enabled` is true.
- Nobody can list or guess tournaments. `share_token` is at least 128 bits from a cryptographically secure random source, in the URL path (never a short code or a counter).

**Share link control.** The organiser can switch sharing off (the link then shows "This tournament is not shared") and can generate a new link (the old one stops working). This is my default, not something the owner chose, because a public link with no off switch is a real risk. Confirm or strike it.

**Live updates.** Slice 1 uses polling: the share page re-reads every 10 seconds while visible and shows "Updated <time>". Realtime push is deferred, because it complicates access rules and 10 seconds is fine for matches that last minutes. The share page shows the read-only schedule, current scores and standings (what the Matches and Board tabs show, with no edit controls).

**Organiser offline.** Entering a score must never fail or be lost because of the network (courts often have poor signal). The organiser's device keeps the tournament locally, saves immediately, syncs when online, and shows a clear "not synced yet" state. Writes carry the `version` they started from; a stale write is rejected and the organiser is told, rather than silently overwriting (two devices, one organiser).

**Auth.** Google and magic link. The same email address reached either way must land in the same account, not two (verify this against the auth provider's behaviour; do not assume).

## Open decisions (do not build around these)
1. **Approval gate.** docs/PLAN.md and the Phase 2 roadmap say "sign-up + admin approval". The owner now wants Pro open to anyone who signs up and pays. With no payments in this slice, the gate must be decided: my suggestion is keep approval for the alpha (your group only, per docs/PLAN.md step 3) and open sign-up only when payments ship.
2. **How the private Pro repo imports `packages/core`.** `@net-picking/core` is private and unpublished (`main` points at `src`). Options: a git dependency, publishing the package, or a submodule. Needs an owner decision; not assumed here.
3. **Pricing model**, payment provider and tax handling (India). Pre-sell check first: ask 3-5 groups whether they would pay.
4. **Privacy.** The share page shows players' names to anyone with the link. Decide the retention period, whether organisers can delete a tournament and their account (this spec assumes yes), and check any legal obligations for storing other people's names. I have not verified the law; do not assume.
5. **Abuse and cost.** The public read route needs a rate limit, and the hosting limits for the chosen plan have not been checked.

## Invariants the tests must check
1. A signed-in organiser can create, read, update and delete their own tournament, and cannot read or change another organiser's, through the same API the UI uses. Test with two accounts.
2. The public read returns only the one tournament for a valid token while sharing is on, and nothing for a wrong token, a missing token, or sharing off. It never exposes `owner_id`, the email, or any other tournament. Listing or enumerating tournaments without sign-in returns nothing.
3. Tokens are unique and have at least 128 bits of randomness. Regenerating makes the old link stop working at once.
4. The share page has no edit controls, and a write attempted with a token (no sign-in) is refused by the server, not only hidden in the UI.
5. For the same stored `state`, the organiser's standings and the share page's standings are identical (both from core, a shared test fixture).
6. Scores entered offline appear after reconnecting, in order, and none are lost. A stale write is rejected, not applied.
7. The share page refreshes within 10 seconds of the organiser saving a score and works at 360px width with no horizontal scroll.
8. Google and magic link with the same email give one account.
9. No third-party tracker or analytics runs on the share page.
10. `apps/free` is unchanged: its tests and its saved-tournament key `pickleball_tournament_v1` are untouched.

## Real-device check (owner, before merge)
Organiser on one phone, two other phones open the link (iPhone and Android, plus one on mobile data). Enter a score and watch it appear. Turn sharing off and confirm the link dies. Go offline mid-score and confirm nothing is lost on reconnect.
