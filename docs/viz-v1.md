# Cape COLA viz v1 (3D + horizon scrub)

What the trajectory / neighborhood visualization shows — and what it does not.

## Surfaces

| Surface | Shows |
|---------|--------|
| **3D primary trajectory** | ECEF path from Cape pad through ascent / early orbit (faded polyline for context). |
| **Horizon scrubber** | `tRelSec` from 0 → screening horizon on a **60 s** grid (same as path samples — labeled in UI). |
| **At scrub time t** | Primary position + velocity arrow; same **top-N** approach objects with position, direction, and **distance from primary**. |
| **Near-miss @ t** | Distance &lt; **25 km** at scrub time highlighted; table row selection focuses that secondary (jumps scrub to TCA). |
| **Approach table** | TCA miss distances (screening); clickable sync with the 3D scene. |

Risk strip, delay slider, method captions, and disclaimers unchanged.

## Data

| File | Role |
|------|------|
| `public/data/viz.json` | ECEF pad; `scrubStepSec` / `trackStepSec` (60); per-delay `primaryEcef` + `neighborhood[]` packed ECEF on scrub grid |
| `public/data/approaches.json` | Top-N TCA rows (geodetic + ECEF at TCA) |

`viz.json` is written compact (no pretty-print) because neighborhood scrub samples are large. Runtime: static JSON only — no SGP4 in the browser. Directions use finite differences on the scrub grid.

## Delay / “weather” honesty

Delay changes **liftoff time only**. Relative vehicle TEME profile unchanged. Absolute geometry shifts with Earth rotation + moving secondaries.

## Does not show

- Full catalog / 1200 objects / distance-gated neighborhood
- Lon/lat map or altitude chart as hero
- Covariance, Pc, CDMs, TraCSS
- Shell congestion (v2)
- Real Stoke / operator ephemeris

## Regen

```bash
npm run precompute -- --screen-only
```
