# Rules sources

- Official rulebook (ebook): https://ebooks.usapickleball.org/books/USAP-Official-Rulebook/
- Rules landing page (rule changes document, equipment manual): https://usapickleball.org/rules/
- Edition reviewed: 2026 USA Pickleball Official Rulebook ("2010; revised 2026"), 96-page PDF supplied by the owner. The landing page names it as the current edition and says it is updated at the beginning of each year. No effective date found in the pages reviewed.
- Last checked: 2026-10-11

## Copyright: do not commit or ship the PDF
The PDF carries an all-rights-reserved notice that prohibits dissemination, distribution, publication or copying without USA Pickleball's written consent. Therefore:
- Never commit the rulebook PDF to this repository (`*.pdf` is in .gitignore) and never bundle it into the app.
- Keep quotations of the rulebook short and cite the rule number instead.
- A user-supplied copy stored only on the user's own device is a different thing (see the Rulebook reference item in docs/ROADMAP.md).

## Access note
The ebook is a JavaScript flipbook (FlipHTML5), so agents cannot extract its text by fetching the URL. For any rules-dependent work, the owner supplies the rule number and text; do not infer rules from memory (see AGENTS.md rule 4).

## What the 2026 rulebook says that this app touches (printed page numbers)
- Section 1, page 1: a standard game is first to 11 points and leading by at least 2.
- Rule 15.C, page 35: all tournament scoring options are win by two, except win by one is allowed for team play.
- Rule 15.C.1, page 35: standard formats are best 2-of-3 or 3-of-5 to 11, one game to 15 or 21, and one game to 11 for round robin events with six or more teams only.
- Rule 15.C.2, page 35: rally scoring is a provisional option. 15.C.2.d allows a 7-point game only for inclement weather.
- Rule 15.B.4, pages 33-34: round robin winner is the most matches won; tie-breakers in order are head-to-head record among the tied teams, point differential of all games, point differential of head-to-head games, point differential against the next-highest number of wins, then most points scored.
- Rule 15.B.4.a, page 33: a team that withdraws, retires or is forfeited from a round robin has its results not count toward the standings and is not eligible for the playoff or medal match.
- Section 23 (Retirements and Withdrawals, page 62) has not been reviewed yet for docs/specs/withdrawal.md.

## House rules: where this app deliberately differs from the 2026 rulebook
| Area | Official | This app (owner decisions) |
|---|---|---|
| Game ending | Win by 2 (15.C) | Golden point by default, win by 2 as an option. See docs/specs/tie-rule.md |
| Ranking | Matches won, then the 15.B.4 tie-breakers | +3 per win, -1 per loss, then wins, point difference, points scored, name |
| Teams | Fixed teams | Rotating partners |
| Withdrawal | Withdrawn team's results do not count (15.B.4.a) | Played results stand. See docs/specs/withdrawal.md |
| Game to 7 | Inclement-weather rally scoring only (15.C.2.d) | Offered as a normal option |
