import * as satellite from "satellite.js";

export type GeoPoint = {
  lat: number;
  lon: number;
  altKm: number;
};

export type Vec3 = [number, number, number];

/** Cape Canaveral / SLC-14 style pad (matches primary model). */
export const CAPE_PAD = {
  lat: 28.49,
  lon: -80.55,
  altKm: 0.01,
  label: "Cape Canaveral (SLC-14 style)",
} as const;

function round(n: number, digits: number): number {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

function asPos(
  r: { x: number; y: number; z: number } | Vec3,
): { x: number; y: number; z: number } {
  return Array.isArray(r) ? { x: r[0], y: r[1], z: r[2] } : r;
}

/** TEME/ECI km → geodetic (deg, km). */
export function temeToLla(
  r: { x: number; y: number; z: number } | Vec3,
  date: Date,
): GeoPoint {
  const pos = asPos(r);
  const gmst = satellite.gstime(date);
  const gd = satellite.eciToGeodetic(pos, gmst);
  return {
    lat: round(satellite.degreesLat(gd.latitude), 4),
    lon: round(satellite.degreesLong(gd.longitude), 4),
    altKm: round(gd.height, 2),
  };
}

/** TEME/ECI km → ECEF km (Earth-fixed scene frame). */
export function temeToEcef(
  r: { x: number; y: number; z: number } | Vec3,
  date: Date,
): Vec3 {
  const pos = asPos(r);
  const gmst = satellite.gstime(date);
  const ecf = satellite.eciToEcf(pos, gmst);
  return [round(ecf.x, 2), round(ecf.y, 2), round(ecf.z, 2)];
}

export function padEcef(): Vec3 {
  const ecf = satellite.geodeticToEcf({
    latitude: CAPE_PAD.lat * (Math.PI / 180),
    longitude: CAPE_PAD.lon * (Math.PI / 180),
    height: CAPE_PAD.altKm,
  });
  return [round(ecf.x, 2), round(ecf.y, 2), round(ecf.z, 2)];
}

/** Compact ECEF track sample: [tRelSec, x, y, z] km */
export function compactEcefSample(tRelSec: number, ecef: Vec3): [number, number, number, number] {
  return [tRelSec, ecef[0], ecef[1], ecef[2]];
}
