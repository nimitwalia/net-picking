# Net-picking 🏓

Pickleball tournament tracker: rotating-partner doubles, fair schedules, +3/−1 scoring, finals, shareable results.

- **Free, no backend.** Runs in the browser; data stays on your device. Fork it and host your own on GitHub Pages.
- Live app: https://nimitwalia.github.io/net-picking/

## Repo layout (current)
- `apps/free/`: the live free app (Vite build, published at the site root by GitHub Actions; `public/` holds `sw.js`, the manifest and icons, do not rename them or installed home-screen apps break). The old single-file app is in git at tag `legacy-final`.
- `packages/core/`: pure TypeScript engine (scheduler, scoring, standings), shared by free and pro.
- `docs/`: plan, roadmap, rules sources

## Self-hosting
Fork, then Settings → Pages → Source: GitHub Actions. The `Pages` workflow builds `apps/free` and publishes it on pushes to `main`.

## Licence
MIT.
