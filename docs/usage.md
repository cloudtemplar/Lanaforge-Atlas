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

## When do I re-run what?

| You changed… | Run |
|---|---|
| `data/highlights.json` (added a person/region) | nothing for dev (hot reload); `npx vite build` to redeploy |
| Dot look in code (`CATEGORY_STYLE`, shader, rotation) — `src/*` | `npm run dev` picks it up; `npm run build` to redeploy |
| `STATE_LEVEL`, dot spacing/sources, or the build scripts (`scripts/*`, `src/config.js` SOURCES) | `npm run data` (re-generates `public/data/*` + `iso-reference.md`), then dev/build |
| Natural Earth source version | `npm run fetch-geo` then `npm run data` |