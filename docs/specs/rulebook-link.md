# Rulebook link (free app)

Decided 2026-10-18. Link only. Stored PDFs are deferred (docs/ROADMAP.md, "Deferred from free v1").

## What it is
A small "Rules" card on the Setup screen with two links, taken from docs/RULES_SOURCES.md and no others:
1. "Official rulebook (USA Pickleball)": https://ebooks.usapickleball.org/books/USAP-Official-Rulebook/
2. "Rules updates and equipment manual": https://usapickleball.org/rules/

## Behaviour
- Plain anchors (`<a>`), not buttons, with `target="_blank"` and `rel="noopener noreferrer"`. Styled as the existing ghost pill, at least 44px tall, one per row.
- A line under them: "Opens in your browser and needs internet."
- No rules text, summaries or paraphrases are added (AGENTS.md rule 4). The existing hint that cites Rule 15.C stays as it is.
- The app makes no request to either site: no prefetch, no preconnect, no fetch. The link only loads when the person taps it (AGENTS.md rule 5).
- The links are not cached or intercepted by the service worker. Offline, the app works as before and tapping a link simply fails in the browser.

## Must not change
`sw.js`, the manifest, the icons, the cache name, the localStorage keys. No new storage. No new dependency.

## Invariants the tests must check
1. Both links are present on Setup, with exactly the two URLs above, `target="_blank"` and a `rel` that contains `noopener` and `noreferrer`. The URLs equal the ones listed in docs/RULES_SOURCES.md.
2. Loading and using the app (setup, schedule, scoring) makes no request to any host except the app's own origin. This includes the Setup screen with the card visible.
3. Offline, the page still loads and the card is shown.
4. At 360px width the card does not cause horizontal scrolling, and each link is at least 44px tall.
5. No text from the rulebook is bundled: the built output contains no PDF and no rules paragraph beyond what exists today.

## Real-device check (owner, before merge)
Tap each link on an iPhone (installed home-screen app) and on Android Chrome. Check that the page opens, can be read on a phone, and that you can come back to the app. The official ebook is a JavaScript flipbook and may be awkward on a phone; if it is unusable, report it and we decide whether the link text or target should change.
