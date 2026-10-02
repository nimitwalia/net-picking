@AGENTS.md

## Workflow
One roadmap item per branch and PR. Use the `builder` subagent to implement and the `tester` subagent to write and review tests. The tester works from the rules in AGENTS.md and docs/, not from reading the implementation. Deployment is done by GitHub Actions only; never deploy or push to `main` from here.
