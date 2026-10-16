import { CAPE_PAD, compactTrackSample, temeToLla } from "./geo";
import type { CompactTrackSample, PrimaryEphemeris, VizArtifact } from "../lib/types";

/**
 * Build geodetic primary tracks for each delay.
 * Same relative TEME profile; absolute epoch slides → Earth rotation moves the
 * ground track. Secondaries are not in this file (see approaches.json geo).
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
    const track: CompactTrackSample[] = [];
    for (const sample of opts.ephem.samples) {
      if (sample.tRelSec % opts.trackStepSec !== 0 && sample.tRelSec !== opts.ephem.horizonSec) {
        continue;
      }
      const date = new Date(liftoffMs + sample.tRelSec * 1000);
      const geo = temeToLla(sample.r, date);
      track.push(compactTrackSample(sample.tRelSec, geo));
    }
    byDelayMinutes[String(d)] = { track };
  }

  return {
    pad: {
      lat: CAPE_PAD.lat,
      lon: CAPE_PAD.lon,
      altKm: CAPE_PAD.altKm,
      label: CAPE_PAD.label,
    },
    trackStepSec: opts.trackStepSec,
    ascentDurationSec: opts.ephem.ascentDurationSec,
    horizonSec: opts.ephem.horizonSec,
    honesty: [
      "Delay slider changes liftoff time only — the relative vehicle profile is unchanged.",
      "Absolute geometry vs catalog shifts because Earth rotates and secondaries move on the absolute clock.",
      "Map shows primary ground track + pad; approach markers are primary/secondary at TCA on the 30s screening grid.",
      "Not a 3D globe, not Pc, not ops COLA / TraCSS.",
    ],
    byDelayMinutes,
  };
}
