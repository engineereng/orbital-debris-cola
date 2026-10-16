export type StripStatus = "hold" | "clear";

export type StripCell = {
  delayMinutes: number;
  status: StripStatus;
  minMissKm: number;
  worstNoradId?: string;
};

export type StripArtifact = {
  windowStartUtc: string;
  windowMinutes: number;
  sampleStepMinutes: number;
  keepOutKm: number;
  screeningHorizonLabel: string;
  cells: StripCell[];
};

export type GeoPoint = {
  lat: number;
  lon: number;
  altKm: number;
};

/** ECEF position km */
export type EcefVec = [number, number, number];

export type ApproachRow = {
  noradId: string;
  name: string;
  missKm: number;
  tRelSec: number;
  /** Primary geodetic at TCA (closest sample on 30s grid). */
  primary?: GeoPoint;
  /** Secondary geodetic at TCA. */
  secondary?: GeoPoint;
  /** Primary ECEF km at TCA — for 3D neighborhood. */
  primaryEcef?: EcefVec;
  /** Secondary ECEF km at TCA. */
  secondaryEcef?: EcefVec;
};

export type ApproachesArtifact = {
  topN: number;
  byDelayMinutes: Record<string, ApproachRow[]>;
};

/** Compact ECEF track sample: [tRelSec, xKm, yKm, zKm] */
export type CompactEcefSample = [number, number, number, number];

export type VizArtifact = {
  frame: "ECEF";
  earthRadiusKm: number;
  pad: {
    lat: number;
    lon: number;
    altKm: number;
    label: string;
    ecef: EcefVec;
  };
  trackStepSec: number;
  ascentDurationSec: number;
  horizonSec: number;
  /** What the viz shows / does not claim */
  honesty: string[];
  byDelayMinutes: Record<
    string,
    {
      /** Primary ECEF path for this T₀ (Earth rotation applied to shared TEME profile) */
      primaryEcef: CompactEcefSample[];
    }
  >;
};

export type CatalogMeta = {
  source: string;
  pinnedEpochUtc: string;
  filter: string;
  objectCount: number;
  totalCandidatesBeforeCap: number;
  demoCap: number | null;
  disclaimer: string;
  downloadedAtUtc: string;
};

export type RunMeta = {
  generatedAtUtc: string;
  catalogObjectCount: number;
  primaryVersion: string;
  keepOutKm: number;
  windowStartUtc: string;
  windowMinutes: number;
  sampleStepMinutes: number;
  screeningHorizonSec: number;
  screenStepSec: number;
  topN: number;
  satelliteJsVersion: string;
  notes: string[];
};

export type PrimarySample = {
  tRelSec: number;
  /** TEME/ECI position km */
  r: [number, number, number];
  /** TEME/ECI velocity km/s */
  v: [number, number, number];
};

export type PrimaryEphemeris = {
  version: string;
  label: string;
  disclaimer: string;
  referenceLiftoffUtc: string;
  site: string;
  insertionAltitudeKm: number;
  inclinationDeg: number;
  ascentDurationSec: number;
  horizonSec: number;
  sampleStepSec: number;
  frame: "TEME";
  samples: PrimarySample[];
};
