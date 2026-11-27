# For developers

You don't need anything in this folder to use the theme.

- `build-scene.mjs` draws the scenes. Edit it, then run `node dev/build-scene.mjs` to
  rewrite `hooks/scene.ts`. Add `--preview <folder>` to also save each scene as an SVG.
- `neon.test.tsx` holds the tests. Run them with `claude plugin test .` from the repository root.

The theme itself is `hooks/register.tsx` (backdrop, slideshow, `/neon`), `hooks/band.ts` (the
terminal skyline) and `themes/neon-miami.json` (terminal colors).
