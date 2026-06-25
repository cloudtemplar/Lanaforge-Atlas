# Lanaforge Atlas

A minimalist transparent **dot-matrix 3D globe** (Vite + three.js) highlighting the world
regions where I've met people. Inspired by [sergiomusel.com/travelmap](https://www.sergiomusel.com/travelmap).

- Slowly auto-rotating, transparent globe (you can see the far side through it).
- Left-drag to rotate, scroll to zoom. Rotation pauses only while you drag, and resumes on release.
- Regions where I've met someone glow **orange**; hovering one shows its name; zooming in reveals
  the people's names.
- Light / dark theme (toggle top-right; remembers your choice).

## First-time setup

```bash
npm install
npm run fetch-geo   # one-time: downloads Natural Earth source data into scripts/geo-src/
npm run data        # generates public/data/*.json + iso-reference.md from that source
npm run dev         # http://localhost:5173
```

Both `scripts/geo-src/` (downloaded source) and `public/data/` (generated JSON) are
**gitignored**, so on a fresh clone you must run `fetch-geo` then `data` before `dev`/`build`.

## Adding people / regions (the common case)

The only file you edit by hand is **`data/highlights.json`** (repo root), mapping a region id to
a list of names:

```json
{
  "BR-SP": ["Alice", "Bruno"],
  "JP-13": ["Kenji"],
  "PT":    ["Diogo"]
}
```

- **Just adding a new person to a region you already have** → edit `data/highlights.json` and save.
  In `npm run dev`, Vite hot-reloads it instantly. For a deployed site, run `npm run build` again.
  **No need to re-run `npm run data`.** (Highlights are bundled separately from the generated globe
  data.)
- **Highlighting a new region** → find its id in `iso-reference.md`, add it to
  `data/highlights.json`, save. Same as above — no `npm run data` needed, because every region
  already exists in the generated data. Unknown ids are warned in the console and ignored (and the
  `data-validation` test catches them: `npm test`).

### Region ids (ISO 3166)
- Country = ISO 3166-1 alpha-2: `JP`, `FR`, `PT`, …
- Sub-region = ISO 3166-2: `BR-SP`, `US-CA`, `JP-13`, …
- Only **4 countries are marked at state/province level** (never whole-country): **BR, US, CA, JP**.
  Every other country is highlighted as a whole country. Look up exact codes in `iso-reference.md`.

## When do I re-run what?

| You changed… | Run |
|---|---|
| `data/highlights.json` (added a person/region) | nothing for dev (hot reload); `npm run build` to redeploy |
| Dot look in code (`CATEGORY_STYLE`, shader, rotation) — `src/*` | `npm run dev` picks it up; `npm run build` to redeploy |
| `STATE_LEVEL`, dot spacing/sources, or the build scripts (`scripts/*`, `src/config.js` SOURCES) | `npm run data` (re-generates `public/data/*` + `iso-reference.md`), then dev/build |
| Natural Earth source version | `npm run fetch-geo` then `npm run data` |

## Build & deploy

```bash
npm install
npm run fetch-geo      # one-time, if scripts/geo-src/ isn't populated yet
npm run build          # = npm run data + vite build  ->  dist/
npm run preview        # serve dist/ locally to sanity-check
```

Deploy the `dist/` folder to any static host (GitHub Pages / Vercel / Netlify).

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
architecture and conventions, see `CLAUDE.md` and `docs/superpowers/specs/`.
