# UI pass (free app)

Decided 2026-10-18. Layout and CSS only. No change to scheduling, scoring, standings or finals logic, and no colour change: colours, transitions and the premium look are Pro only (docs/ROADMAP.md, Phase 2). Where this spec and the sub-bullets of the "UI pass" item in docs/ROADMAP.md differ, this spec wins.

## 1. Docked bottom tab bar
- Same four tabs, same labels, same text-only look (cream pill for the active tab). No icons.
- The bar becomes a full-width strip fixed to the bottom of the viewport, with the page's existing background colour and a 1px top line in the existing line colour. It stays on screen while the page scrolls, so nobody scrolls to reach a tab.
- The DOM does not change. `<nav id="nav">` keeps its place in index.html, its buttons keep `data-tab`, `data-act="tab"` and their text. Only CSS moves it. Reason: most of the e2e tests select `#nav button[data-tab=...]`, the golden-master harness compares the nav's `innerText`, and a parity test checks the nav/main/header order.
- Each tab button is at least 44px tall. The bar's bottom padding includes `env(safe-area-inset-bottom)` (the viewport already has `viewport-fit=cover`).
- While a text input, textarea or select has focus, the bar is hidden; it returns on blur. Hide it by sliding it off-screen (transform) and disabling pointer events. Do NOT use `display:none` or `visibility:hidden`: the golden-master harness reads the nav's `innerText` and must still see the tab text.
- Page bottom padding equals the bar height plus the safe-area inset and stays constant whether the bar is shown or hidden, so showing and hiding never moves content.
- `scroll-padding-bottom` (and `scroll-margin-bottom` where `scroll-margin-top` is used today) makes sure that `scrollIntoView`, focus scrolling and the existing scroll-to-next-match after saving a score never land under the bar.
- Modals (confirm and result image) are drawn above the bar.
- The rules for which tabs are enabled or disabled and which one is active do not change.

## 2. One pill style for action buttons
- Every action button (the `.btn` family, including `.btn.small` in the header, and any link that uses the `.btn` class) is at least 44px tall and fully rounded: computed `border-radius` is at least half the rendered height.
- Not action buttons, and unchanged: the "Play to" tiles, the stat tiles, inputs and the select, the two-way segmented toggles, and the player chips.

## 3. "Make this my default"
- It is a ghost pill (the existing `.btn.ghost` look) on its own row, with the "Default for new tournaments: ..." note on the line below it. No inline `style=` strings.
- If the tie rule selected on the Setup scoring card equals the remembered default, the button is disabled and reads "Default saved". Otherwise it is enabled and reads "Make this my default". Pressing it stores the default as today and the button then shows the disabled "Default saved" state.
- The remembered default still affects only tournaments created afterwards (docs/specs/tie-rule.md, unchanged). The hooks `data-tie-ui="default"`, `"default-row"` and `"default-note"` stay.

## 4. Generate / Regenerate schedule
- Full width of the content column (the same width as the cards above it), at least 52px tall, inline at the end of the form. It is not fixed to the screen, because regenerating erases entered results.
- "Back to matches", when shown, sits below it, same width, as a ghost pill at least 44px tall.
- Labels, disabled rules, the "Regenerating erases N result(s)" warning and the confirm dialog do not change.

## 5. Every button has a class
- No `<button>` rendered by the app is without a `class` attribute, on Setup (including the default row), Matches, Board, Finals and in both modals. Also a static scan: no `<button` in `apps/free/src` or `apps/free/index.html` without `class=`. This is deliberately narrow; it catches an unstyled native button and nothing more.

## Must not change
`sw.js`, the manifest, the icons, the cache name, the localStorage keys, the colour tokens, any user-visible text except the one label change in section 3. No new dependency, no new storage, no network request.

## Invariants the tests must check (360x800 viewport)
1. On Setup (with enough players to make the page scroll) and on Matches, the bar's bounding box is the same before and after scrolling to the bottom, and its bottom edge is at the bottom of the viewport.
2. Scrolled to the bottom, the last content element ends above the top of the bar.
3. Focusing a text input, textarea or select hides the bar (it is off-screen and not clickable) and blurring brings it back, while `#nav` still contains all four tab labels in `innerText`. Focusing a button does not hide it.
4. After saving a score, the next match that is scrolled into view is not under the bar.
5. With a confirm modal open, the bar is not on top of it.
6. All action buttons are at least 44px tall and have a computed radius of at least half their height; the Generate button is at least 52px tall and as wide as the cards; Generate/Regenerate is not `position: fixed`.
7. The default button follows section 3 in all four states: default golden and selected golden, selected win2 while the default is golden, after pressing it, and after reloading.
8. Every button has a class (section 5), runtime and static.
9. The existing e2e, parity and golden-master tests still pass, except the ones that pin the OLD app's markup or the previous build's text, which this item changes on purpose. Known ones: `cutover-parity.test.ts` (index.html outside the script must equal the old file plus an exact allowlist of added lines), `tie-normalisation.spec.ts` (Setup DOM equal to the old app's, minus `[data-tie-ui]` and `#rulesCard`), the structure parity tests, and the committed fixture `apps/free/tests/baselines/rulebook-baseline.json` (text runs from the built `main.js`, and sha256 of the public files). Each may be edited only as narrowly as the rulebook-link PR did: an exact-string allowlist for each intended difference (for example the exact CSS lines or class names this item adds), never a removed or loosened assertion. Every edited test is listed in the report with the reason. Any other existing test that fails or contradicts this spec: stop and report it; do not edit it to fit.
   The baseline fixture is regenerated by hand today. As part of this item, add a small script that regenerates it from the build and say in the test's header comment how to run it, so the next item does not have to do it by hand.
10. No colour token value differs from the one on `main`.

## Cannot be tested by the automated suite
The phone keyboard and the iOS home-indicator inset are not emulated by Playwright (the inset reads as 0), so the owner checks them.

## Real-device check (owner, before merge)
On an iPhone (installed home-screen app) and on Android Chrome:
- The bar stays at the bottom while scrolling a long Setup and Matches.
- Tap a score box: the keyboard opens, the bar is hidden, nothing covers the boxes or Save score, and Save score can be tapped. After saving, the bar is back and the next match is in view above it.
- At the end of Setup, Generate is fully visible above the bar.
- The bottom tabs are comfortably tappable near the screen edge, clear of the home indicator.
- "Make this my default" looks like the other buttons and behaves as in section 3.
