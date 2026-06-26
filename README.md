# Lanaforge Atlas

A minimalist transparent **dot-matrix 3D globe** (Vite + three.js) highlighting the world
regions where I've met people.

- Slowly auto-rotating, transparent globe (you can see the far side through it).
- Left-drag to rotate, scroll to zoom. Rotation pauses only while you drag, and resumes on release.
- Regions where I've met someone glow **orange**; hovering one shows its name; zooming in reveals
  the people's names.
- Light / dark theme (toggle top-right; remembers your choice).

### Region ids (ISO 3166)
- Country = ISO 3166-1 alpha-2: `JP`, `FR`, `PT`, …
- Sub-region = ISO 3166-2: `BR-SP`, `US-CA`, `CA-ON`, …
- Only **3 countries are marked at state/province level** (never whole-country): **BR, US, CA**.
  Every other country is highlighted as a whole country. Look up exact codes in `iso-reference.md`.

## Build & deploy

```bash
npm install
npm run fetch-geo      # one-time, if scripts/geo-src/ isn't populated yet
npm run build          # = npm run data + vite build  ->  dist/
npm run preview        # serve dist/ locally to sanity-check
```

> `npm run build` runs `npm run data` for you, but `data` needs the downloaded source in
> `scripts/geo-src/`. If it's missing, run `npm run fetch-geo` first (otherwise build fails with
> ENOENT).

## Tests

```bash
npm test               # Vitest: geo math, region/point generation, labels, theme, data validation
```

## How it works (short version)

A build-time Node pipeline turns Natural Earth GeoJSON into static JSON (dot positions tagged by
category, per-region metadata). The browser loads that JSON and renders a transparent dot-matrix
globe with three.js plus an HTML overlay for labels. All the heavy geometry (point-in-polygon,
arc-length resampling) runs at build time — the client just draws precomputed points. For deeper
architecture and conventions, see `CLAUDE.md`.
