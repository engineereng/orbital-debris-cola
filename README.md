# Cape COLA — Nova-class screening demo

Portfolio **COLA screening** demo: scrub a 2-hour Cape Canaveral launch window against a pinned LEO catalog, paint hold periods from a miss-distance keep-out, and inspect top close approaches for a selected liftoff delay.

**This is not operational COLA, TraCSS, or a launch-commit tool.**

## What you get (v1)

- Simulated Nova-class LEO insertion (Cape SLC-14 style narrative — **not** real Stoke ephemeris)
- 2 h window × 1 min samples (121 candidate T₀ values)
- Screening horizon: ascent + ~3 h early orbit per T₀
- Keep-out rule: miss distance **&lt; 25 km** → hold on the risk strip
- Pinned CelesTrak GP/TLE-class catalog (LEO perigee &lt; 2000 km), demo-capped for size
- Offline UI: risk strip · delay slider · **pad/trajectory + approach viz** · approach table · honesty disclaimer
- Delay = liftoff time only (does not reshape the vehicle profile); absolute geometry vs catalog shifts with Earth rotation + moving secondaries
- Shell congestion / altitude–inclination bins → **v2**

## Run locally (offline)

```bash
npm install
npm run dev          # http://127.0.0.1:43127
```

Committed artifacts under `public/data/` mean **no live SSA APIs** and no precompute step for the interview demo.

```bash
npm run build && npm start
```

## Regenerate strip (optional)

Needs a CelesTrak-style 3-line TLE dump at `data/catalog/source-active.tle` (not required at runtime).

```bash
# Example pin source (public GP):
# curl -fsSL "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle" \
#   -o data/catalog/source-active.tle

npm run precompute   # pins capped catalog + primary, writes strip/approaches/viz
```

Outputs:

| Path | Role |
|------|------|
| `data/catalog/catalog.tle` | Pinned demo catalog |
| `data/primary/nova-class-v1.json` | Simulated primary ephemeris |
| `data/artifacts/*.json` | Precompute outputs (incl. `viz.json`) |
| `public/data/*.json` | Static files the UI fetches (`strip`, `approaches`, `viz`, meta) |

Viz details: Project store `docs/viz-v1.md` (pad + ground track + altitude chart; what is / is not shown).

## Honesty note

- Miss-distance keep-out is a **demo screening rule**, not probability of collision.
- Catalog is **TLE/GP-class**, pinned and capped — not HAC/SP. NASA does not recommend TLEs for operational Pc / mitigation.
- Primary trajectory is **parametric / simulated**.
- Real CA/COLA uses CDMs, owner/operator ephemerides with covariance, and SP / High Accuracy Catalog inputs.

## Fidelity compromises (v1)

- Catalog: **1200** objects drawn from ~15k LEO candidates (perigee &lt; 2000 km) in a CelesTrak `active` snapshot — labeled in-app.
- Primary: coarse parametric ascent → circular LEO, TEME-sampled — credible strip behavior, not vehicle truth.
- Screening grid: 30 s samples along the horizon.

## Stack

Next.js App Router · TypeScript · Tailwind · `satellite.js` precompute CLI · static JSON artifacts.
