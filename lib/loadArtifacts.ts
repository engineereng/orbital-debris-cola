import type {
  ApproachesArtifact,
  CatalogMeta,
  CompactEcefSample,
  EcefVec,
  GeoPoint,
  RunMeta,
  StripArtifact,
  VizArtifact,
  VizDelayEntry,
} from "./types";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    throw new Error(`Failed to load ${path} (${res.status})`);
  }
  return (await res.json()) as T;
}

export type DemoArtifacts = {
  strip: StripArtifact;
  approaches: ApproachesArtifact;
  viz: VizArtifact;
  catalogMeta: CatalogMeta;
  runMeta: RunMeta;
};

export async function loadDemoArtifacts(): Promise<DemoArtifacts> {
  const [strip, approaches, viz, catalogMeta, runMeta] = await Promise.all([
    fetchJson<StripArtifact>("/data/strip.json"),
    fetchJson<ApproachesArtifact>("/data/approaches.json"),
    fetchJson<VizArtifact>("/data/viz.json"),
    fetchJson<CatalogMeta>("/data/catalog.meta.json"),
    fetchJson<RunMeta>("/data/run.meta.json"),
  ]);
  return { strip, approaches, viz, catalogMeta, runMeta };
}

export function formatUtc(iso: string): string {
  const d = new Date(iso);
  return d.toISOString().replace(".000Z", "Z");
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h}h ${rm}m`;
  }
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export type EcefPoint = {
  tRelSec: number;
  ecef: EcefVec;
};

export function expandEcefTrack(samples: CompactEcefSample[]): EcefPoint[] {
  return samples.map(([tRelSec, x, y, z]) => ({
    tRelSec,
    ecef: [x, y, z],
  }));
}

/** Nearest scrub index for tRelSec on a primaryEcef track. */
export function scrubIndexForTime(
  track: CompactEcefSample[],
  tRelSec: number,
): number {
  if (track.length === 0) return 0;
  let best = 0;
  let bestAbs = Infinity;
  for (let i = 0; i < track.length; i++) {
    const d = Math.abs(track[i][0] - tRelSec);
    if (d < bestAbs) {
      bestAbs = d;
      best = i;
    }
  }
  return best;
}

export function primaryAtIndex(
  track: CompactEcefSample[],
  index: number,
): { tRelSec: number; ecef: EcefVec; vel: EcefVec } | null {
  if (index < 0 || index >= track.length) return null;
  const [tRelSec, x, y, z] = track[index];
  const ecef: EcefVec = [x, y, z];
  // Finite-difference velocity (km/s) from neighboring samples
  const i1 = Math.min(index + 1, track.length - 1);
  const i0 = Math.max(index - 1, 0);
  const dt = Math.max(1, track[i1][0] - track[i0][0]);
  const vel: EcefVec = [
    (track[i1][1] - track[i0][1]) / dt,
    (track[i1][2] - track[i0][2]) / dt,
    (track[i1][3] - track[i0][3]) / dt,
  ];
  return { tRelSec, ecef, vel };
}

export function neighborhoodAtIndex(
  entry: VizDelayEntry,
  noradId: string,
  index: number,
): { ecef: EcefVec; vel: EcefVec } | null {
  const obj = entry.neighborhood.find((n) => n.noradId === noradId);
  if (!obj) return null;
  const nSteps = entry.primaryEcef.length;
  if (index < 0 || index >= nSteps) return null;
  const o = index * 3;
  const ecef: EcefVec = [obj.ecef[o], obj.ecef[o + 1], obj.ecef[o + 2]];
  if (Math.hypot(ecef[0], ecef[1], ecef[2]) < 1) return null;
  const i1 = Math.min(index + 1, nSteps - 1);
  const i0 = Math.max(index - 1, 0);
  const dt = Math.max(
    1,
    entry.primaryEcef[i1][0] - entry.primaryEcef[i0][0],
  );
  const o0 = i0 * 3;
  const o1 = i1 * 3;
  const vel: EcefVec = [
    (obj.ecef[o1] - obj.ecef[o0]) / dt,
    (obj.ecef[o1 + 1] - obj.ecef[o0 + 1]) / dt,
    (obj.ecef[o1 + 2] - obj.ecef[o0 + 2]) / dt,
  ];
  return { ecef, vel };
}

export function distKm(a: EcefVec, b: EcefVec): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export type LiveNeighborhoodObject = {
  noradId: string;
  name: string;
  ecef: EcefVec;
  vel: EcefVec;
  distKm: number;
  breach: boolean;
};

/** Top-N approach objects at scrub time t for the selected delay. */
export function computeLiveNeighborhood(
  viz: VizArtifact,
  delayMinutes: number,
  approaches: { noradId: string; name: string }[],
  scrubTRelSec: number,
  keepOutKm: number,
): LiveNeighborhoodObject[] {
  const entry = viz.byDelayMinutes[String(delayMinutes)];
  if (!entry) return [];
  const scrubIdx = scrubIndexForTime(entry.primaryEcef, scrubTRelSec);
  const primary = primaryAtIndex(entry.primaryEcef, scrubIdx);
  if (!primary) return [];
  const out: LiveNeighborhoodObject[] = [];
  for (const row of approaches) {
    const sample = neighborhoodAtIndex(entry, row.noradId, scrubIdx);
    if (!sample) continue;
    const d = distKm(primary.ecef, sample.ecef);
    out.push({
      noradId: row.noradId,
      name: row.name,
      ecef: sample.ecef,
      vel: sample.vel,
      distKm: d,
      breach: d < keepOutKm,
    });
  }
  return out;
}

export type { GeoPoint, EcefVec };
