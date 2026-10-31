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
Payments or billing; byes, courts, withdrawal, ratings, Mexicano or any other Phase 2 feature; padel; fixed teams, brackets and the official-rules mode (see "Later phases"); restyling the four existing tabs (see "UI direction"); viewer accounts, chat or comments; import from the free app; Apple or phone sign-in (docs/PLAN.md gate); any change to `apps/free`.

## Rules that carry over unchanged
- All scheduling, scoring and standings logic comes from `packages/core`. Pro must not re-implement any of it. The share page computes standings with core from the stored tournament, so the organiser's screen and the players' screen cannot disagree.
- Win +3 / loss -1, the tie rule (`golden` or `win2`) per tournament, courts = floor(players/4), and the scheduler weights stay as in AGENTS.md.
- No pickleball rules are invented (AGENTS.md rule 4).
- No secrets in client code (rule 6). The 360px phone width and the black theme with cream/pastel elements still apply (rule 7).

## Design (decisions the builder follows; the owner approves them here)
**Data.** One row per tournament: `id`, `owner_id` (the signed-in user), `state` (the same tournament object the free app saves, as JSON, so core reads it directly), `share_token`, `sharing_enabled`, `version`, `created_at`, `updated_at`, and three columns that the first slice only stores: `sport` (default `pickleball`), `rules_mode` (`house` or `official`, default `house`) and `format` (`rotating` or `fixed_teams`, default `rotating`). Slice 1 builds only pickleball, house rules, rotating partners; the columns exist so later phases need no migration. Standings and schedule are not stored; they are computed from `state` by core.

**Who can do what.**
- Organiser (signed in): create, read, update and delete only their own tournaments. Enforced by row-level security on the table, not only in the UI.
- Anyone with a link: read one tournament only. The public page never gets table-level read access. It reads through a server route or a database function that takes a token and returns that one tournament's `state` (and nothing else), only while `sharing_enabled` is true.
- Nobody can list or guess tournaments. `share_token` is at least 128 bits from a cryptographically secure random source, in the URL path (never a short code or a counter).

**Share link control.** The organiser can switch sharing off (the link then shows "This tournament is not shared") and can generate a new link (the old one stops working). This is my default, not something the owner chose, because a public link with no off switch is a real risk. Confirm or strike it.

**Live updates.** Slice 1 uses polling: the share page re-reads every 10 seconds while visible and shows "Updated <time>". Realtime push is deferred, because it complicates access rules and 10 seconds is fine for matches that last minutes. The share page shows the read-only schedule, current scores and standings (what the Matches and Board tabs show, with no edit controls).

**Organiser offline.** Entering a score must never fail or be lost because of the network (courts often have poor signal). The organiser's device keeps the tournament locally, saves immediately, syncs when online, and shows a clear "not synced yet" state. Writes carry the `version` they started from; a stale write is rejected and the organiser is told, rather than silently overwriting (two devices, one organiser).

**Auth.** Google and magic link. The same email address reached either way must land in the same account, not two (verify this against the auth provider's behaviour; do not assume).

## Later phases the design must not block (owner decisions, 2026-10-25)
None of this is built in slice 1. It is recorded so slice 1 does not close the door.

**Who it is for.** Anyone who pays: clubs running real tournaments, and friends playing among themselves. "Well-run event" is the goal, not USA Pickleball sanctioning. Screens may say "follows the USA Pickleball rulebook", never "sanctioned".

**Rules mode switch: Official or House.** One setting per tournament (`rules_mode`).
- Official follows only what the 2026 USA Pickleball Official Rulebook provides: fixed teams (Rule 15.A.3), the Rule 15.B formats, win by two (15.C), and the Rule 15.B.4 round-robin tie-breakers. Rule 16.F says a Tournament Director must not impose a rule that is not in the rulebook; the rulebook lists exceptions that have not been reviewed here.
- House allows the owner's own choices: rotating partners, golden point, +3/-1 scoring, the other differences listed in docs/RULES_SOURCES.md ("House rules" table).
- Official mode can never offer golden point or rotating partners.

**Fixed teams (`format = fixed_teams`).** The first fixed-team format is a single round robin with the official tie-breakers (15.B.4), then an optional single-elimination playoff for the top teams (15.B.6). Pool play (15.B.5) comes after that. This needs a new scheduler and a new standings module in `packages/core`, with its own tests, behind the same interface as the rotating-partner one. Two-match minimum per player (15.F) except in single elimination without consolation. Pool size, number advancing and seeding are not set by the rulebook: they are the organiser's choices and are labelled as such on screen. Teams are entered by hand, or built from ratings.

**Ratings and balanced teams.** Each player may have an optional rating, typed in by the organiser (with an optional DUPR ID as a label only). Balanced teams: rank by rating, pair the strongest with the weakest, then the second strongest with the second weakest, and so on. This is the app's own method, not an official rule, and is labelled as such. Ratings are visible to the organiser only: never on the share page and never in the public read.

**DUPR.** DUPR has an API, but its terms for third-party apps are not public (the Pickleball Brackets FAQ says each player needs a DUPR ID), and DUPR's club partnership agreement forbids a partner providing DUPR rating or profile data to anyone. So: no scraping of DUPR pages; no DUPR data flow until DUPR gives written access terms. Decision for the owner when the time comes: contact DUPR.

**Padel (`sport = padel`).** FIP Rules of Padel, in force 1 January 2026: https://www.padelfip.com/wp-content/uploads/2025/12/FIP_Rules-of-Padel.pdf. Points in a game are 15, 30, 40, game, with advantage, Star Point or Golden Point as the deciding-point option; a set is first to 6 games by 2 (7-5 or a 7-point tie-break at 6-6); a match is best of three sets, with listed alternatives such as a super tie-break (first to 10, by 2). Played in pairs. The rulebook has nothing on Americano, Mexicano or other rotating-partner formats, so those would be house formats. A padel result is sets and games, not one pair of numbers: core needs a second result shape and its own standings module, and "DIFF" must be defined for padel (games, not points) before building. The rule text must come from the owner (docs/RULES_SOURCES.md access note).

**Shared code stays sport-neutral.** No pickleball-only wording or scoring assumption in shared UI, share page or storage. Rules cards, labels and scoring modules are per sport.

## UI direction (draft, mockups in the owner's design canvas)
Proposed, owner to confirm: build the share page and the new Pro screens (sign-in, tournament list, share controls) in the new look from the start, and restyle the four existing tabs in a later PR, so no screen is built twice.
- White ground with one accent. Chosen by the owner on 2026-10-25: slate (action colour #2F3E4D, light slate #D9E0E6 for fills). The sky-blue option was dropped. Slate checks: white on #2F3E4D is 10.95:1, secondary text #55616D on white 6.33:1, control border #7A8794 on white 3.67:1.
- Tokens (colours, fonts, spacing, radii) live in one place so the look can change without a rewrite.
- Contrast: text at least 4.5:1, control borders at least 3:1. Sky blue #C9DDE6 is for fills only (1.4:1 as text on white). Rank changes use shapes and numbers, never colour alone.
- Fonts are self-hosted: loading them from a third party would break invariant 9.
- 44px tap targets, 360px width, a docked bottom bar that hides while a field has focus, motion that respects "reduce motion". Real-device checks remain the only proof.

## Alpha hosting and rollout (owner decisions, 2026-10-31)
- **Hosting.** Vercel Hobby (free), on the owner's existing personal account, as its own project for the private repo. Supabase free plan, project `net-picking-pro`, region South Asia (Mumbai). A separate Vercel team was checked: Vercel's Create Team dialog offers only Pro Trial or Pro, so a free separate team is not available.
- **No custom domain for the alpha.** The app uses its `vercel.app` address. The owner will revisit this later.
- **Consequence, accepted by the owner.** Share links and sign-in redirects use the `vercel.app` address. If the host or address changes (a custom domain, a move to a Vercel Pro team), every link already shared stops working. Alpha users are told this in advance.
- **Alpha terms.** A small, invited group who know it is a trial run: things may break and data may be reset. Proposed: a one-line notice on the sign-in screen and the share page saying so.
- **Conditions that make this decision valid.** No payments, no ads, no paid pre-sales through the app. Vercel's fair use guidelines limit Hobby to non-commercial use and define commercial use as any deployment run for anyone's financial gain, including requesting payment from visitors.
- **Hard gate before the first payment.** (1) Move to a paid Vercel plan. (2) Move Supabase to a paid plan: free projects pause after 7 days of low activity. (3) Decide the custom domain and migrate existing links, or retire them with notice.
- **Builder rules that keep the later move cheap.** The app's public address comes from one configuration value; no `vercel.app` address is written in code or tests. The share link is built from that value (the production address, never a per-deployment address). Sign-in redirect URLs are allowed in Supabase for that address only. The repo keeps a checklist of required environment variable names (names only, no values) and where each comes from. Secret keys never go in client code or git.

## Open decisions (do not build around these)
1. **Approval gate.** docs/PLAN.md and the Phase 2 roadmap say "sign-up + admin approval". The owner now wants Pro open to anyone who signs up and pays. With no payments in this slice, the gate must be decided: my suggestion is keep approval for the alpha (your group only, per docs/PLAN.md step 3) and open sign-up only when payments ship.
2. **How the private Pro repo imports `packages/core`.** `@net-picking/core` is private and unpublished (`main` points at `src`). Options: a git dependency, publishing the package, or a submodule. Needs an owner decision; not assumed here.
3. **Pricing model**, payment provider and tax handling (India). Pre-sell check first: ask 3-5 groups whether they would pay.
4. **Privacy.** The share page shows players' names to anyone with the link. Decide the retention period, whether organisers can delete a tournament and their account (this spec assumes yes), and check any legal obligations for storing other people's names. I have not verified the law; do not assume.
5. **Abuse and cost.** The public read route needs a rate limit. Vercel Hobby's published usage guideline is 1,000,000 function invocations a month; Supabase free-plan limits (database size, bandwidth, auth emails) have not been checked.

6. **UI sequencing** (see above). The accent is decided: slate.
7. **DUPR access:** whether to contact DUPR, and when.
8. **Fixed-team details:** pool size, number advancing, seeding method, and tie-break edge cases the rulebook leaves open.

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

11. Every tournament row has `sport`, `rules_mode` and `format`, defaulting to `pickleball`, `house` and `rotating`; slice 1 rejects any other value.
12. The public read returns a fixed list of fields (an allow-list). Ratings, owner details and any field added later are not returned unless the allow-list is changed on purpose.
13. No source or test file contains a hardcoded `vercel.app` address or any other deployment host. The public address, the share link and the sign-in redirects all come from the one configuration value.

## Real-device check (owner, before merge)
Organiser on one phone, two other phones open the link (iPhone and Android, plus one on mobile data). Enter a score and watch it appear. Turn sharing off and confirm the link dies. Go offline mid-score and confirm nothing is lost on reconnect.
