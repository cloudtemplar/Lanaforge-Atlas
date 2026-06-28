# How Lanaforge Atlas Works

A plain-language tour of the machinery behind the dot-matrix globe — from raw map data
to the website you can open in a browser. The heavy work happens **once, on the
developer's machine** ("build time"); the visitor's browser only draws the finished result.

---

## 1. Data extraction (getting the raw maps)

- The world's geography is downloaded from **Natural Earth**, a free public-domain map dataset.
- Five files are pulled: country outlines, state/province outlines, country borders, state
  borders, and the coastline.
- These come as **GeoJSON** — plain text listing the corner coordinates (longitude/latitude) of
  every country and coastline as connected dots.
- This is a one-time fetch (`npm run fetch-geo`); the files are saved locally and reused.

## 2. Pre-processing (turning outlines into dots) — the math

This is where the globe's dotted look is computed. Everything here runs once, on the developer's
machine, and the answers are frozen into a data file.

- **Coastline & borders → evenly spaced dots.** A coastline is a chain of line segments of
  uneven length. We walk along it and place a dot every fixed *arc-length* interval using
  **arc-length resampling**: distances are measured with the **haversine formula** (great-circle
  distance on a sphere), and new dots are placed by **linear interpolation** between the original
  corners, carrying the leftover distance across each segment so spacing stays uniform.
- **Land interior → a uniform grid of dots.** We sweep latitude/longitude in a regular grid. But
  a degree of longitude shrinks toward the poles, so a naïve grid would clump dots near the top
  and bottom. We apply a **cosine-of-latitude correction** (the longitude step is divided by
  `cos(latitude)`) so dot density stays even across the whole sphere.
- **Which country does each dot belong to?** Each candidate dot is tested with a
  **point-in-polygon** check (`geoContains`) against every country shape. To keep this fast, each
  shape first gets a **bounding box**, and a dot is only tested against shapes whose box it falls
  inside. Country polygons are also normalized to a consistent **winding order** (counter-clockwise)
  so "inside" is unambiguous — a ring enclosing more than **2π steradians** of the sphere is
  detected as inverted and flipped.
- **Dots on a boundary.** A coast or border dot sits exactly on an edge, so a single test can miss.
  We **nudge the probe** a fraction of a degree in 8 directions and collect every country found —
  this lets a shared border light up *completely* when either neighbour is highlighted, instead of
  only half of it.
- **Thinning (removing pile-ups).** Where categories overlap (dense places like Japan), dots are
  culled by **priority** — coast beats border beats land. A lower-priority dot is dropped if it
  falls within a **clearance radius** (again measured by great-circle distance) of an
  already-kept higher-priority dot. A spatial **hash grid** makes this neighbour search efficient
  instead of comparing every dot to every other dot.
- The result is a compact JSON file: a flat list of dots, each tagged with its position, category
  (coast/land/border), and which region(s) it belongs to.

## 3. Rendering (drawing it in the browser)

- The browser loads that pre-computed JSON — it does **no** geography math itself, just drawing.
- Each dot's longitude/latitude is mapped onto a 3D sphere with standard spherical coordinates
  (`x = r·cosφ·cosλ`, `y = r·sinφ`, `z = −r·cosφ·sinλ`).
- All dots are drawn in a single fast **GPU shader pass**. Dots are *world-anchored*: their
  on-screen size scales with the inverse of their distance to the camera
  (`size ∝ refDistance / depth`), so they grow naturally as you zoom in. The far side of the
  globe is dimmed by a depth-based fade so the sphere reads as transparent.
- **Highlighting:** the author's personal data (`highlights.json`) lists the regions where they've
  met people. Matching dots are recolored and brightened, and an HTML text overlay shows the
  people's names, fading in as you zoom toward a region.

## 4. Build & deploy (publishing it)

- **Build** (`npm run build`) runs the pre-processing and then bundles everything — code, data, and
  the author's highlights — into a small static folder (`dist/`) of plain HTML/JS/CSS.
- *(If only `highlights.json` changes, the slow geography step can be skipped — just re-bundle.)*
- **Deploy** (`npm run deploy`) uploads that folder to **Cloudflare Pages**, a global hosting
  network, where it's served to anyone who visits the site.
- Because all the hard computation already happened at build time, the live site is just static
  files — it loads fast and needs no server doing calculations.
