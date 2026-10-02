# Roadmap (one item per PR)

## Phase 0: foundation
- [ ] Set up pnpm workspace, TypeScript, Vitest, Vite
- [ ] Port scheduler to packages/core with tests (valid counts, no repeats, no back-to-back)
- [ ] Port scoring (win-by-2 validation) and standings with tests
- [ ] Port free UI to apps/free using core, no behaviour change
- [ ] GitHub Actions: test on PR, deploy apps/free to Pages

## Phase 1: free v1
- [ ] JSON export/import + undo last score
- [ ] Byes / any player count, rank by points per match when counts differ
- [ ] Courts: floor(N/4) offered, optional court names, rounds view with resting players
- [ ] Mobile QA on iOS Safari and Android Chrome

## Phase 2: pro (private repo)
- [ ] Next.js + Supabase, Google + email sign-in
- [ ] Pending/approved/rejected profiles, admin approval page, RLS on every table
- [ ] Import free-version JSON export
