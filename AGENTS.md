# Cape COLA agents notes

- Product specs live in the Project store docs (`mvp-v1-plan.md`, `architecture-v1.md`).
- Runtime UI reads only `public/data/*.json` — no screening API (`strip`, `approaches`, `viz`, meta).
- Regenerate with `npm run precompute` when catalog pin, primary model, keep-out, or viz track step changes.
- Primary TEME must stay satellite.js-compatible (same frame as SGP4 secondaries) for miss distance + map geodetic.
- Do not claim ops COLA, TraCSS, Pc, or real Stoke ephemeris in copy.
- Shell congestion is v2.
