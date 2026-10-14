import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PrimaryEphemeris, PrimarySample } from "../lib/types";

const EARTH_RADIUS_KM = 6378.137;
const MU = 398600.4418;
const OMEGA_EARTH = 7.292115e-5;
const DEG = Math.PI / 180;

/** Cape Canaveral / SLC-14 style pad (approx). */
const CAPE = { latDeg: 28.49, lonDeg: -80.55, altKm: 0.01 };

function normalizeAngle(a: number): number {
  let x = a % (2 * Math.PI);
  if (x < 0) x += 2 * Math.PI;
  return x;
}

/** Approximate GMST (rad) from Julian date — sufficient for synthetic TEME. */
function gmstRad(date: Date): number {
  const jd =
    date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545.0) / 36525;
  let gmst =
    (67310.54841 +
      (876600 * 3600 + 8640184.812866) * t +
      0.093104 * t * t -
      6.2e-6 * t * t * t) *
    DEG /
    240;
  return normalizeAngle(gmst);
}

function ecefFromLla(latDeg: number, lonDeg: number, altKm: number): [number, number, number] {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const cosLat = Math.cos(lat);
  const sinLat = Math.sin(lat);
  const r = EARTH_RADIUS_KM + altKm;
  return [r * cosLat * Math.cos(lon), r * cosLat * Math.sin(lon), r * sinLat];
}

function ecefToTeme(rEcef: [number, number, number], date: Date): [number, number, number] {
  const theta = gmstRad(date);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // ECEF → TEME: rotate by -GMST about Z
  return [c * rEcef[0] + s * rEcef[1], -s * rEcef[0] + c * rEcef[1], rEcef[2]];
}

function vEcefToTeme(vEcef: [number, number, number], rEcef: [number, number, number], date: Date): [number, number, number] {
  const theta = gmstRad(date);
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  // Account for Earth rotation: v_inertial_ecef_frame = v_ecef + ω × r
  const wxr: [number, number, number] = [
    -OMEGA_EARTH * rEcef[1],
    OMEGA_EARTH * rEcef[0],
    0,
  ];
  const vInertialEcef: [number, number, number] = [
    vEcef[0] + wxr[0],
    vEcef[1] + wxr[1],
    vEcef[2] + wxr[2],
  ];
  return [
    c * vInertialEcef[0] + s * vInertialEcef[1],
    -s * vInertialEcef[0] + c * vInertialEcef[1],
    vInertialEcef[2],
  ];
}

function add(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: [number, number, number], s: number): [number, number, number] {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function norm(a: [number, number, number]): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function unit(a: [number, number, number]): [number, number, number] {
  const n = norm(a) || 1;
  return scale(a, 1 / n);
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Parametric Nova-class LEO insertion from Cape (SLC-14 style narrative).
 * Simulated — not real Stoke ephemeris.
 */
export function generateNovaClassEphemeris(opts: {
  referenceLiftoffUtc: string;
  insertionAltitudeKm?: number;
  inclinationDeg?: number;
  ascentDurationSec?: number;
  horizonSec?: number;
  sampleStepSec?: number;
}): PrimaryEphemeris {
  const insertionAltitudeKm = opts.insertionAltitudeKm ?? 520;
  const inclinationDeg = opts.inclinationDeg ?? 28.5;
  const ascentDurationSec = opts.ascentDurationSec ?? 540;
  const horizonSec = opts.horizonSec ?? 3 * 3600 + ascentDurationSec;
  const sampleStepSec = opts.sampleStepSec ?? 30;
  const liftoff = new Date(opts.referenceLiftoffUtc);

  const a = EARTH_RADIUS_KM + insertionAltitudeKm;
  const n = Math.sqrt(MU / (a * a * a));
  const vOrb = Math.sqrt(MU / a);
  const i = inclinationDeg * DEG;

  // Choose RAAN so ascending-node/ground-track is Cape-adjacent at insertion
  const padEcef = ecefFromLla(CAPE.latDeg, CAPE.lonDeg, CAPE.altKm);
  const padTeme0 = ecefToTeme(padEcef, new Date(liftoff.getTime() + ascentDurationSec * 1000));
  const nodeLon = Math.atan2(padTeme0[1], padTeme0[0]);
  const raan = normalizeAngle(nodeLon);

  function orbitalState(tRelSec: number): { r: [number, number, number]; v: [number, number, number] } {
    const tOrbit = Math.max(0, tRelSec - ascentDurationSec);
    const u = n * tOrbit; // true anomaly for circular from insertion
    // PQW for circular equatorial then rotate by R3(raan) R1(i)
    const rPqw: [number, number, number] = [a * Math.cos(u), a * Math.sin(u), 0];
    const vPqw: [number, number, number] = [-vOrb * Math.sin(u), vOrb * Math.cos(u), 0];

    const ci = Math.cos(i);
    const si = Math.sin(i);
    const co = Math.cos(raan);
    const so = Math.sin(raan);

    const rot = (p: [number, number, number]): [number, number, number] => {
      // R3(raan) * R1(i) * p
      const x1 = p[0];
      const y1 = p[1] * ci - p[2] * si;
      const z1 = p[1] * si + p[2] * ci;
      return [x1 * co - y1 * so, x1 * so + y1 * co, z1];
    };

    return { r: rot(rPqw), v: rot(vPqw) };
  }

  const samples: PrimarySample[] = [];
  for (let t = 0; t <= horizonSec; t += sampleStepSec) {
    const date = new Date(liftoff.getTime() + t * 1000);
    if (t < ascentDurationSec) {
      const frac = t / ascentDurationSec;
      // Smoothstep altitude + downrange toward insertion state
      const s = frac * frac * (3 - 2 * frac);
      const alt = CAPE.altKm + s * insertionAltitudeKm;
      // Downrange east ~1500 km class over ascent
      const downrangeKm = s * 1800;
      const lon = CAPE.lonDeg + (downrangeKm / (EARTH_RADIUS_KM * Math.cos(CAPE.latDeg * DEG))) / DEG;
      const lat = CAPE.latDeg + s * 0.4; // slight north creep
      const rEcef = ecefFromLla(lat, lon, alt);
      const r = ecefToTeme(rEcef, date);

      // Velocity: blend pad-relative eastward accel into orbital v
      const insert = orbitalState(ascentDurationSec);
      const eastEcef: [number, number, number] = unit([
        -Math.sin(lon * DEG),
        Math.cos(lon * DEG),
        0,
      ]);
      const upEcef = unit(rEcef);
      const vAscentEcef = add(scale(eastEcef, 0.2 + 7.2 * s), scale(upEcef, 1.2 * (1 - s)));
      const vAscent = vEcefToTeme(vAscentEcef, rEcef, date);
      const v = add(scale(vAscent, 1 - s), scale(insert.v, s));
      // Soft blend position toward insertion at end of ascent
      const rBlend = add(scale(r, 1 - s * 0.35), scale(insert.r, s * 0.35));
      samples.push({ tRelSec: t, r: rBlend, v });
    } else {
      const st = orbitalState(t);
      samples.push({ tRelSec: t, r: st.r, v: st.v });
    }
  }

  return {
    version: "nova-class-v1",
    label: "Simulated Nova-class LEO insertion (Cape SLC-14 style)",
    disclaimer:
      "Parametric simulated trajectory for COLA screening demo — not real Stoke / operator ephemeris.",
    referenceLiftoffUtc: opts.referenceLiftoffUtc,
    site: "Cape Canaveral (SLC-14 style narrative)",
    insertionAltitudeKm,
    inclinationDeg,
    ascentDurationSec,
    horizonSec,
    sampleStepSec,
    frame: "TEME",
    samples,
  };
}

export function writePrimaryEphemeris(path: string, ephem: PrimaryEphemeris): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(ephem, null, 2) + "\n");
}

export function loadPrimaryEphemeris(path: string): PrimaryEphemeris {
  return JSON.parse(readFileSync(path, "utf8")) as PrimaryEphemeris;
}

/** Shift primary samples in absolute time by delayMinutes (relative profile unchanged). */
export function shiftedPrimaryPositions(
  ephem: PrimaryEphemeris,
  delayMinutes: number,
): { tAbsMs: number; r: [number, number, number] }[] {
  const base = new Date(ephem.referenceLiftoffUtc).getTime() + delayMinutes * 60_000;
  return ephem.samples.map((s) => ({
    tAbsMs: base + s.tRelSec * 1000,
    r: s.r,
  }));
}

void join;
void cross;
