# Roadmap (one item per PR)

## Phase 0: foundation
- [x] Set up pnpm workspace, TypeScript, Vitest
- [ ] Set up Vite (arrives with apps/free)
- [x] Port scheduler to packages/core with tests (valid counts, no repeats, no back-to-back)
- [x] Port scoring (win-by-2 validation) and standings with tests
- [ ] Port pickTeams, finalFour and finalTeams from index.html to packages/core with tests
- [ ] Port free UI to apps/free using core, no behaviour change
- [x] GitHub Actions: test on PR
- [ ] GitHub Actions: deploy apps/free to Pages

## Phase 0b: follow-up
- [x] Seeded/injectable RNG and clock in the scheduler; property tests with fixed seeds for no-repeat-partners and no-back-to-back; differential tests for checkScore and standings against the original index.html logic
- Note: Scheduler heuristic gap: buildSchedule(8,7) leaves 4 repeated partners where 0 is possible; log gap vs lower bound for N=8..14. Not a blocker.

## Phase 1: free v1
- [ ] JSON export/import + undo last score
- [ ] Optional byes (default off) and per-match ranking when byes are on. See docs/specs/byes-and-ranking.md
- [ ] Courts: floor(N/4) offered, optional court names, rounds view with resting players
- [ ] Player withdrawal and skip-next-match with undo. See docs/specs/withdrawal.md (depends on seeded RNG, byes, undo)
- [ ] Mobile QA on iOS Safari and Android Chrome

## Phase 2: pro (private repo)
- [ ] Next.js + Supabase, Google + email sign-in
- [ ] Pending/approved/rejected profiles, admin approval page, RLS on every table
- [ ] Import free-version JSON export
