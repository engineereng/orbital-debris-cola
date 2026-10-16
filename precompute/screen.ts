import * as satellite from "satellite.js";
import type { CatalogObject } from "./catalog";
import { temeToLla } from "./geo";
import type { ApproachRow, GeoPoint, PrimaryEphemeris, StripCell } from "../lib/types";

const KEEP_OUT_KM = 25;

function missKm(
  a: [number, number, number],
  b: { x: number; y: number; z: number },
): number {
  return Math.hypot(a[0] - b.x, a[1] - b.y, a[2] - b.z);
}

type SecondaryCache = {
  obj: CatalogObject;
  /** position at each global sample index; null if propagate failed */
  positions: ({ x: number; y: number; z: number } | null)[];
};

/**
 * Pre-propagate all catalog objects on a shared absolute time grid covering
 * window open → window end + screening horizon.
 */
export function buildSecondaryCache(
  objects: CatalogObject[],
  gridTimesMs: number[],
): SecondaryCache[] {
  const caches: SecondaryCache[] = [];
  for (const obj of objects) {
    const positions: SecondaryCache["positions"] = new Array(gridTimesMs.length);
    for (let i = 0; i < gridTimesMs.length; i++) {
      const date = new Date(gridTimesMs[i]);
      const pv = satellite.propagate(obj.satrec, date);
      if (
        pv &&
        typeof pv !== "boolean" &&
        pv.position &&
        typeof pv.position !== "boolean" &&
        Number.isFinite(pv.position.x)
      ) {
        positions[i] = pv.position as { x: number; y: number; z: number };
      } else {
        positions[i] = null;
      }
    }
    caches.push({ obj, positions });
  }
  return caches;
}

export function screenDelay(opts: {
  ephem: PrimaryEphemeris;
  delayMinutes: number;
  caches: SecondaryCache[];
  gridStartMs: number;
  gridStepMs: number;
  keepOutKm?: number;
  topN?: number;
}): { cell: StripCell; approaches: ApproachRow[] } {
  const keepOutKm = opts.keepOutKm ?? KEEP_OUT_KM;
  const topN = opts.topN ?? 20;
  const liftoffMs =
    new Date(opts.ephem.referenceLiftoffUtc).getTime() +
    opts.delayMinutes * 60_000;

  type Cand = ApproachRow & {
    key: string;
    primaryR: [number, number, number];
    secondaryR: { x: number; y: number; z: number };
    tAbsMs: number;
  };
  const bestByObject = new Map<string, Cand>();
  let globalMin = Infinity;
  let worstNoradId: string | undefined;

  for (const sample of opts.ephem.samples) {
    const tAbsMs = liftoffMs + sample.tRelSec * 1000;
    const idx = Math.round((tAbsMs - opts.gridStartMs) / opts.gridStepMs);
    if (idx < 0) continue;

    for (const cache of opts.caches) {
      if (idx >= cache.positions.length) continue;
      const sec = cache.positions[idx];
      if (!sec) continue;
      const d = missKm(sample.r, sec);
      if (d < globalMin) {
        globalMin = d;
        worstNoradId = cache.obj.noradId;
      }
      const prev = bestByObject.get(cache.obj.noradId);
      if (!prev || d < prev.missKm) {
        bestByObject.set(cache.obj.noradId, {
          key: cache.obj.noradId,
          noradId: cache.obj.noradId,
          name: cache.obj.name,
          missKm: d,
          tRelSec: sample.tRelSec,
          primaryR: sample.r,
          secondaryR: sec,
          tAbsMs,
        });
      }
    }
  }

  const approaches = [...bestByObject.values()]
    .sort((a, b) => a.missKm - b.missKm)
    .slice(0, topN)
    .map((c) => {
      const date = new Date(c.tAbsMs);
      const primary: GeoPoint = temeToLla(c.primaryR, date);
      const secondary: GeoPoint = temeToLla(c.secondaryR, date);
      return {
        noradId: c.noradId,
        name: c.name,
        missKm: Math.round(c.missKm * 100) / 100,
        tRelSec: c.tRelSec,
        primary,
        secondary,
      };
    });

  const minMissKm =
    Number.isFinite(globalMin) && globalMin !== Infinity
      ? Math.round(globalMin * 100) / 100
      : 99999;

  const cell: StripCell = {
    delayMinutes: opts.delayMinutes,
    status: minMissKm < keepOutKm ? "hold" : "clear",
    minMissKm,
    worstNoradId,
  };

  return { cell, approaches };
}
