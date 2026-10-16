import { CAPE_PAD, compactEcefSample, padEcef, temeToEcef } from "./geo";
import type { SecondaryCache } from "./screen";
import type {
  ApproachesArtifact,
  CompactEcefSample,
  NeighborhoodScrubObject,
  PrimaryEphemeris,
  VizArtifact,
} from "../lib/types";

const EARTH_RADIUS_KM = 6378.137;

/**
 * Build ECEF primary tracks + top-N neighborhood scrub samples for each delay.
 * Scrub grid = trackStepSec (60 s) — labeled in UI. Velocities derived via FD in the client.
 */
export function buildVizArtifact(opts: {
  ephem: PrimaryEphemeris;
  windowMinutes: number;
  sampleStepMinutes: number;
  trackStepSec: number;
  approaches: ApproachesArtifact;
  caches: SecondaryCache[];
  gridStartMs: number;
  gridStepMs: number;
}): VizArtifact {
  const delays = opts.windowMinutes / opts.sampleStepMinutes;
  const byDelayMinutes: VizArtifact["byDelayMinutes"] = {};
  const refMs = new Date(opts.ephem.referenceLiftoffUtc).getTime();
  const cacheByNorad = new Map(
    opts.caches.map((c) => [c.obj.noradId, c] as const),
  );

  // Shared scrub times from primary samples at track step
  const scrubTimes = opts.ephem.samples
    .filter(
      (s) =>
        s.tRelSec % opts.trackStepSec === 0 ||
        s.tRelSec === opts.ephem.horizonSec,
    )
    .map((s) => s.tRelSec);

  for (let d = 0; d <= delays; d++) {
    const liftoffMs = refMs + d * 60_000;
    const primaryEcef: CompactEcefSample[] = [];
    for (const sample of opts.ephem.samples) {
      if (
        sample.tRelSec % opts.trackStepSec !== 0 &&
        sample.tRelSec !== opts.ephem.horizonSec
      ) {
        continue;
      }
      const date = new Date(liftoffMs + sample.tRelSec * 1000);
      const ecef = temeToEcef(sample.r, date);
      primaryEcef.push(compactEcefSample(sample.tRelSec, ecef));
    }

    const rows = opts.approaches.byDelayMinutes[String(d)] ?? [];
    const neighborhood: NeighborhoodScrubObject[] = [];
    for (const row of rows) {
      const cache = cacheByNorad.get(row.noradId);
      const packed: number[] = new Array(scrubTimes.length * 3).fill(0);
      if (cache) {
        for (let i = 0; i < scrubTimes.length; i++) {
          const tAbsMs = liftoffMs + scrubTimes[i] * 1000;
          const idx = Math.round(
            (tAbsMs - opts.gridStartMs) / opts.gridStepMs,
          );
          if (idx < 0 || idx >= cache.positions.length) continue;
          const sec = cache.positions[idx];
          if (!sec) continue;
          const ecef = temeToEcef(sec, new Date(tAbsMs));
          const o = i * 3;
          // 1-decimal km keeps arrows/distances honest enough and shrinks JSON
          packed[o] = Math.round(ecef[0] * 10) / 10;
          packed[o + 1] = Math.round(ecef[1] * 10) / 10;
          packed[o + 2] = Math.round(ecef[2] * 10) / 10;
        }
      }
      neighborhood.push({ noradId: row.noradId, ecef: packed });
    }

    byDelayMinutes[String(d)] = { primaryEcef, neighborhood };
  }

  return {
    frame: "ECEF",
    earthRadiusKm: EARTH_RADIUS_KM,
    pad: {
      lat: CAPE_PAD.lat,
      lon: CAPE_PAD.lon,
      altKm: CAPE_PAD.altKm,
      label: CAPE_PAD.label,
      ecef: padEcef(),
    },
    trackStepSec: opts.trackStepSec,
    scrubStepSec: opts.trackStepSec,
    ascentDurationSec: opts.ephem.ascentDurationSec,
    horizonSec: opts.ephem.horizonSec,
    honesty: [
      "Delay slider changes liftoff time only — the relative vehicle profile is unchanged.",
      "Absolute geometry vs catalog shifts because Earth rotates and secondaries move on the absolute clock.",
      "Horizon scrub steps at scrubStepSec along ascent + early orbit; neighborhood = same top-N approaches (not full catalog).",
      "At scrub time t: primary + top-N positions/directions; distance from primary; keep-out highlight if < 25 km at t.",
      "Not Pc / ops COLA / TraCSS / real Stoke ephemeris.",
    ],
    byDelayMinutes,
  };
}
