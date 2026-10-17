# Legacy app fixture (test only, never published)

Byte-exact copies of the old root app, taken from git tag `legacy-final` (commit 63b4001):
`index.html`, `sw.js`, `manifest.webmanifest`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`.

Used as the oracle in the golden-master (old vs new) tests and as the "old installed app" in the
upgrade test. They are NOT part of the build and are never published (assemble-site only reads
`apps/free/dist`). Do not edit or reformat them; `.gitattributes` here disables line-ending conversion.

Regenerate with: `git show legacy-final:<file> > <file>`.
