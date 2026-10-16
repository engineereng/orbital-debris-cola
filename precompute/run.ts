/**
 * Offline COLA strip precompute.
 *
 * Usage:
 *   npx tsx precompute/run.ts            # full regen (expects data/catalog source or pins)
 *   npx tsx precompute/run.ts --pin-only # pin catalog + primary only
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  loadPinnedCatalog,
  writePinnedCatalog,
} from "./catalog";
import {
  generateNovaClassEphemeris,
  loadPrimaryEphemeris,
  writePrimaryEphemeris,
} from "./primary";
import { buildSecondaryCache, screenDelay } from "./screen";
import { buildVizArtifact } from "./viz-track";
import { buildRunMeta, writeArtifacts } from "./write-artifacts";
import type { ApproachesArtifact, StripArtifact } from "../lib/types";

const ROOT = join(import.meta.dirname, "..");
const CATALOG_DIR = join(ROOT, "data/catalog");
const PRIMARY_PATH = join(ROOT, "data/primary/nova-class-v1.json");
const ARTIFACTS_DIR = join(ROOT, "data/artifacts");
const PUBLIC_DATA = join(ROOT, "public/data");
const SOURCE_TLE =
  process.env.COLA_SOURCE_TLE ?? join(ROOT, "data/catalog/source-active.tle");

const WINDOW_MINUTES = 120;
const SAMPLE_STEP_MINUTES = 1;
const KEEP_OUT_KM = 25;
const TOP_N = 20;
const DEMO_CAP = 1200;
const MAX_PERIGEE_KM = 2000;
const SCREEN_STEP_SEC = 30;
/** Geodetic primary track sample step for map / altitude chart (seconds). */
const VIZ_TRACK_STEP_SEC = 60;

/** Pinned demo window — aligned to catalog median epoch day (set after pin). */
const DEFAULT_WINDOW_START = "2026-10-12T16:00:00.000Z";

function ensureSourceTle(): void {
  if (existsSync(SOURCE_TLE)) return;
  const candidates = [
    "/tmp/tle-active.tle",
    "/tmp/active.tle",
  ];
  for (const c of candidates) {
    if (existsSync(c)) {
      mkdirSync(CATALOG_DIR, { recursive: true });
      copyFileSync(c, SOURCE_TLE);
      console.log(`Copied source TLE from ${c}`);
      return;
    }
  }
  throw new Error(
    `Missing source TLE at ${SOURCE_TLE}. Download CelesTrak active GP and place it there.`,
  );
}

function pinInputs(windowStartUtc: string): void {
  ensureSourceTle();
  console.log("Pinning LEO catalog (perigee < 2000 km, demo-capped)...");
  const { meta } = writePinnedCatalog({
    sourceTlePath: SOURCE_TLE,
    outDir: CATALOG_DIR,
    maxPerigeeKm: MAX_PERIGEE_KM,
    demoCap: DEMO_CAP,
    sourceLabel: "CelesTrak GP GROUP=active (pinned snapshot)",
  });
  console.log(
    `Catalog pin: ${meta.objectCount} objects (from ${meta.totalCandidatesBeforeCap} LEO candidates)`,
  );

  // Align window to catalog pin day if default
  const pinDay = meta.pinnedEpochUtc.slice(0, 10);
  const alignedWindow =
    windowStartUtc.slice(0, 10) === "2026-10-12"
      ? `${pinDay}T16:00:00.000Z`
      : windowStartUtc;

  console.log("Generating simulated Nova-class primary ephemeris...");
  const ephem = generateNovaClassEphemeris({
    referenceLiftoffUtc: alignedWindow,
    sampleStepSec: SCREEN_STEP_SEC,
    ascentDurationSec: 540,
    horizonSec: 540 + 3 * 3600,
  });
  writePrimaryEphemeris(PRIMARY_PATH, ephem);
  console.log(
    `Primary: ${ephem.samples.length} samples, horizon ${ephem.horizonSec}s, ref ${ephem.referenceLiftoffUtc}`,
  );
}

function runScreen(): void {
  const { objects, meta: catalogMeta } = loadPinnedCatalog(CATALOG_DIR);
  const ephem = loadPrimaryEphemeris(PRIMARY_PATH);
  const windowStartUtc = ephem.referenceLiftoffUtc;
  const windowStartMs = new Date(windowStartUtc).getTime();
  const horizonSec = ephem.horizonSec;
  const gridStepMs = SCREEN_STEP_SEC * 1000;
  const gridEndMs = windowStartMs + (WINDOW_MINUTES * 60 + horizonSec) * 1000;
  const gridTimesMs: number[] = [];
  for (let t = windowStartMs; t <= gridEndMs + gridStepMs; t += gridStepMs) {
    gridTimesMs.push(t);
  }

  console.log(
    `Propagating ${objects.length} secondaries × ${gridTimesMs.length} times...`,
  );
  const t0 = Date.now();
  const caches = buildSecondaryCache(objects, gridTimesMs);
  console.log(`Secondary cache in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const cells = [];
  const byDelayMinutes: ApproachesArtifact["byDelayMinutes"] = {};
  const delays = WINDOW_MINUTES / SAMPLE_STEP_MINUTES;

  for (let d = 0; d <= delays; d++) {
    const { cell, approaches } = screenDelay({
      ephem,
      delayMinutes: d,
      caches,
      gridStartMs: windowStartMs,
      gridStepMs,
      keepOutKm: KEEP_OUT_KM,
      topN: TOP_N,
    });
    cells.push(cell);
    byDelayMinutes[String(d)] = approaches;
    if (d % 15 === 0) {
      console.log(
        `  delay +${d} min → ${cell.status} (min miss ${cell.minMissKm} km)`,
      );
    }
  }

  const strip: StripArtifact = {
    windowStartUtc,
    windowMinutes: WINDOW_MINUTES,
    sampleStepMinutes: SAMPLE_STEP_MINUTES,
    keepOutKm: KEEP_OUT_KM,
    screeningHorizonLabel: "ascent + ~3h early orbit",
    cells,
  };

  const approaches: ApproachesArtifact = { topN: TOP_N, byDelayMinutes };

  console.log("Building per-delay primary ECEF tracks for 3D viz…");
  const viz = buildVizArtifact({
    ephem,
    windowMinutes: WINDOW_MINUTES,
    sampleStepMinutes: SAMPLE_STEP_MINUTES,
    trackStepSec: VIZ_TRACK_STEP_SEC,
  });

  const holdCount = cells.filter((c) => c.status === "hold").length;
  const runMeta = buildRunMeta({
    catalogObjectCount: objects.length,
    primaryVersion: ephem.version,
    keepOutKm: KEEP_OUT_KM,
    windowStartUtc,
    windowMinutes: WINDOW_MINUTES,
    sampleStepMinutes: SAMPLE_STEP_MINUTES,
    screeningHorizonSec: horizonSec,
    screenStepSec: SCREEN_STEP_SEC,
    topN: TOP_N,
    satelliteJsVersion: "7.x",
    notes: [
      `Catalog: ${catalogMeta.source}; filter ${catalogMeta.filter}`,
      catalogMeta.demoCap
        ? `Demo cap applied: ${catalogMeta.objectCount} of ${catalogMeta.totalCandidatesBeforeCap} LEO candidates`
        : "Full filtered LEO set used",
      `Hold cells: ${holdCount} / ${cells.length}`,
      "Miss-distance keep-out is a demo screening rule — not Pc / ops COLA",
      `Viz: per-delay primary ECEF tracks @ ${VIZ_TRACK_STEP_SEC}s + approach ECEF/geodetic at TCA`,
    ],
  });

  writeArtifacts({
    artifactsDir: ARTIFACTS_DIR,
    publicDataDir: PUBLIC_DATA,
    strip,
    approaches,
    viz,
    runMeta,
    catalogMetaPath: join(CATALOG_DIR, "catalog.meta.json"),
  });

  console.log(
    `Wrote artifacts → ${ARTIFACTS_DIR} and ${PUBLIC_DATA} (${holdCount} holds / ${cells.length} cells)`,
  );
}

const pinOnly = process.argv.includes("--pin-only");
const screenOnly = process.argv.includes("--screen-only");

if (!screenOnly) {
  pinInputs(DEFAULT_WINDOW_START);
}
if (!pinOnly) {
  runScreen();
}
