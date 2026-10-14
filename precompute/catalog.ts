import * as satellite from "satellite.js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CatalogMeta } from "../lib/types";

const EARTH_RADIUS_KM = 6378.137;
const MU_KM3_S2 = 398600.4418;

export type CatalogObject = {
  noradId: string;
  name: string;
  line1: string;
  line2: string;
  satrec: satellite.SatRec;
  perigeeKm: number;
};

function meanMotionToPerigeeKm(line2: string): number | null {
  // TLE line 2: eccentricity at cols 27-33 (0.xxxxxxx), mean motion at 53-63
  const eccStr = line2.slice(26, 33).trim();
  const nStr = line2.slice(52, 63).trim();
  const e = Number(`0.${eccStr}`);
  const nRevPerDay = Number(nStr);
  if (!Number.isFinite(e) || !Number.isFinite(nRevPerDay) || nRevPerDay <= 0) {
    return null;
  }
  const nRadPerSec = (nRevPerDay * 2 * Math.PI) / 86400;
  const a = Math.cbrt(MU_KM3_S2 / (nRadPerSec * nRadPerSec));
  return a * (1 - e) - EARTH_RADIUS_KM;
}

export function parseTleCatalog(tleText: string): Omit<CatalogObject, "satrec" | "perigeeKm">[] {
  const lines = tleText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const out: Omit<CatalogObject, "satrec" | "perigeeKm">[] = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const name = lines[i];
    const line1 = lines[i + 1];
    const line2 = lines[i + 2];
    if (!line1.startsWith("1 ") || !line2.startsWith("2 ")) {
      i -= 2;
      continue;
    }
    const noradId = line1.slice(2, 7).trim();
    out.push({ noradId, name, line1, line2 });
  }
  return out;
}

export function filterLeoPerigee(
  objects: Omit<CatalogObject, "satrec" | "perigeeKm">[],
  maxPerigeeKm: number,
): CatalogObject[] {
  const out: CatalogObject[] = [];
  for (const obj of objects) {
    const perigeeKm = meanMotionToPerigeeKm(obj.line2);
    if (perigeeKm == null || perigeeKm >= maxPerigeeKm || perigeeKm < -50) continue;
    const satrec = satellite.twoline2satrec(obj.line1, obj.line2);
    if (satrec.error) continue;
    out.push({ ...obj, satrec, perigeeKm });
  }
  return out;
}

/** Prefer non-Starlink diversity, then fill with Starlink up to cap. */
export function capDemoSubset(objects: CatalogObject[], cap: number): CatalogObject[] {
  if (objects.length <= cap) return objects;
  const isStarlink = (o: CatalogObject) => /STARLINK/i.test(o.name);
  const non = objects.filter((o) => !isStarlink(o));
  const star = objects.filter(isStarlink);
  if (non.length >= cap) {
    // stride sample for coverage
    const step = non.length / cap;
    const picked: CatalogObject[] = [];
    for (let i = 0; i < cap; i++) picked.push(non[Math.floor(i * step)]);
    return picked;
  }
  const remaining = cap - non.length;
  const step = star.length / remaining;
  const pickedStar: CatalogObject[] = [];
  for (let i = 0; i < remaining; i++) pickedStar.push(star[Math.floor(i * step)]);
  return [...non, ...pickedStar];
}

export function tleEpochUtc(line1: string): Date {
  const year = Number(line1.slice(18, 20));
  const day = Number(line1.slice(20, 32));
  const fullYear = year < 57 ? 2000 + year : 1900 + year;
  const d = new Date(Date.UTC(fullYear, 0, 1));
  d.setUTCMilliseconds(d.getUTCMilliseconds() + (day - 1) * 86400000);
  return d;
}

export function writePinnedCatalog(opts: {
  sourceTlePath: string;
  outDir: string;
  maxPerigeeKm: number;
  demoCap: number;
  sourceLabel: string;
}): { objects: CatalogObject[]; meta: CatalogMeta } {
  const text = readFileSync(opts.sourceTlePath, "utf8");
  const parsed = parseTleCatalog(text);
  const leo = filterLeoPerigee(parsed, opts.maxPerigeeKm);
  const capped = capDemoSubset(leo, opts.demoCap);

  // Sort for stable pin
  capped.sort((a, b) => Number(a.noradId) - Number(b.noradId));

  const epochs = capped.map((o) => tleEpochUtc(o.line1).getTime());
  const medianEpoch = new Date(epochs.sort((a, b) => a - b)[Math.floor(epochs.length / 2)]);

  const tleOut = capped.map((o) => `${o.name}\n${o.line1}\n${o.line2}`).join("\n") + "\n";
  mkdirSync(opts.outDir, { recursive: true });
  writeFileSync(join(opts.outDir, "catalog.tle"), tleOut);

  const meta: CatalogMeta = {
    source: opts.sourceLabel,
    pinnedEpochUtc: medianEpoch.toISOString(),
    filter: `perigee_km < ${opts.maxPerigeeKm}`,
    objectCount: capped.length,
    totalCandidatesBeforeCap: leo.length,
    demoCap: capped.length < leo.length ? opts.demoCap : null,
    disclaimer:
      "TLE/GP-class screening input — not HAC/SP. Demo pin is a capped LEO subset of a public active catalog snapshot.",
    downloadedAtUtc: new Date().toISOString(),
  };
  writeFileSync(join(opts.outDir, "catalog.meta.json"), JSON.stringify(meta, null, 2) + "\n");
  return { objects: capped, meta };
}

export function loadPinnedCatalog(catalogDir: string): {
  objects: CatalogObject[];
  meta: CatalogMeta;
} {
  const meta = JSON.parse(
    readFileSync(join(catalogDir, "catalog.meta.json"), "utf8"),
  ) as CatalogMeta;
  const text = readFileSync(join(catalogDir, "catalog.tle"), "utf8");
  const parsed = parseTleCatalog(text);
  const objects: CatalogObject[] = parsed.map((o) => {
    const perigeeKm = meanMotionToPerigeeKm(o.line2) ?? NaN;
    const satrec = satellite.twoline2satrec(o.line1, o.line2);
    return { ...o, satrec, perigeeKm };
  });
  return { objects, meta };
}

// silence unused import in type-only path
void dirname;
