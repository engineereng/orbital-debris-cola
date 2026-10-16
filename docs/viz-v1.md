# Cape COLA viz v1 (3D hero)

What the trajectory / neighborhood visualization shows — and what it does not.

## Surfaces

| Surface | Shows |
|---------|--------|
| **3D primary trajectory** | ECEF path from Cape pad through ascent / early orbit (sampled ephemeris). Orbit-drag + zoom. |
| **Neighborhood** | Top-N close-approach catalog objects for the selected T₀ at TCA (static artifact positions). |
| **Near-miss highlights** | Objects with miss &lt; **25 km** emphasized (hold color); selected table row highlights the matching secondary and draws a primary↔secondary segment at TCA. |
| **Approach table** | Same rows; clickable — selection syncs with the 3D scene. |

Risk strip, delay slider, method captions, and disclaimers are unchanged. Method captions stay short: miss = 3D separation on a **30 s** grid, **25 km** keep-out, **pinned TLE** catalog, simulated Nova-class.

## Data

| File | Role |
|------|------|
| `public/data/viz.json` | `frame: ECEF`, pad (+ ECEF), per-delay `primaryEcef` samples `[tRelSec, x, y, z]` km @ 60 s |
| `public/data/approaches.json` | Top-N rows with geodetic + `primaryEcef` / `secondaryEcef` at TCA |

Runtime reads static JSON only — no screening API, no SGP4 in the browser.

## Delay / “weather” honesty

The delay slider changes **liftoff time only**. The relative vehicle TEME profile is **not** reshaped. Absolute geometry vs the catalog changes because:

1. Earth rotates (same inertial samples → different ECEF path), and  
2. Secondaries move on the absolute clock (SGP4 at the shifted epoch).

Pad marker is the Cape site. Primary path is the time-shifted inertial profile converted to ECEF for the selected T₀.

## Stack

Next.js UI + **react-three-fiber** / Three.js canvas (client-only dynamic import). Precompute via `satellite.js`.

## Does not show

- Lon/lat ground-track map or altitude-vs-time as the hero (removed / demoted)
- Full catalog cloud (neighborhood = top-N approaches only)
- Covariance, Pc, CDMs, TraCSS thresholds
- Live catalog or weather/range Go-NoGo
- Shell congestion (v2)
- Real Stoke / operator ephemeris

## Regen

```bash
npm run precompute -- --screen-only
```

Writes `strip.json`, `approaches.json`, `viz.json`, `run.meta.json` into `data/artifacts/` and `public/data/`.
