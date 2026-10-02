# Net-picking 🏓

Pickleball tournament tracker: rotating-partner doubles, fair schedules, +3/−1 scoring, finals, shareable results.

- **Free, no backend.** Runs in the browser; data stays on your device. Fork it and host your own on GitHub Pages.
- Live app: https://nimitwalia.github.io/net-picking/

## Repo layout (current)
- `index.html`, `sw.js`, `manifest.webmanifest`, icons: the live free app (served from the repo root by GitHub Pages; do not move until the Pages source is switched, or the live URL and installed home-screen apps break)
- `packages/core/`: pure TypeScript engine (scheduler, scoring, standings), shared by free and pro. Empty until Phase 0.
- `docs/`: plan, roadmap, rules sources

## Self-hosting
Fork, then Settings → Pages → deploy from the `main` branch root.

## Licence
MIT.
