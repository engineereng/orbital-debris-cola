import { CAPE_PAD, compactEcefSample, padEcef, temeToEcef } from "./geo";
import type { CompactEcefSample, PrimaryEphemeris, VizArtifact } from "../lib/types";

const EARTH_RADIUS_KM = 6378.137;

/**
 * Build ECEF primary tracks for each delay (3D hero).
 * Same relative TEME profile; absolute epoch slides → Earth rotation moves ECEF path.
 * Neighborhood secondaries live on approaches.json (primaryEcef / secondaryEcef at TCA).
 */
export function buildVizArtifact(opts: {
  ephem: PrimaryEphemeris;
  windowMinutes: number;
  sampleStepMinutes: number;
  trackStepSec: number;
}): VizArtifact {
  const delays = opts.windowMinutes / opts.sampleStepMinutes;
  const byDelayMinutes: VizArtifact["byDelayMinutes"] = {};
  const refMs = new Date(opts.ephem.referenceLiftoffUtc).getTime();

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
    byDelayMinutes[String(d)] = { primaryEcef };
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
    ascentDurationSec: opts.ephem.ascentDurationSec,
    horizonSec: opts.ephem.horizonSec,
    honesty: [
      "Delay slider changes liftoff time only — the relative vehicle profile is unchanged.",
      "Absolute geometry vs catalog shifts because Earth rotates and secondaries move on the absolute clock.",
      "3D view: ECEF primary path from pad through ascent/early orbit; neighborhood = top-N approaches at TCA.",
      "Near-miss highlight: miss < 25 km on the 30 s screening grid — not Pc / ops COLA / TraCSS.",
    ],
    byDelayMinutes,
  };
}
