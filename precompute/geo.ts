import * as satellite from "satellite.js";

export type GeoPoint = {
  lat: number;
  lon: number;
  altKm: number;
};

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

/** TEME/ECI km → geodetic (deg, km). Uses satellite.js gstime + eciToGeodetic. */
export function temeToLla(
  r: { x: number; y: number; z: number } | [number, number, number],
  date: Date,
): GeoPoint {
  const pos =
    Array.isArray(r) ? { x: r[0], y: r[1], z: r[2] } : r;
  const gmst = satellite.gstime(date);
  const gd = satellite.eciToGeodetic(pos, gmst);
  return {
    lat: round(satellite.degreesLat(gd.latitude), 4),
    lon: round(satellite.degreesLong(gd.longitude), 4),
    altKm: round(gd.height, 2),
  };
}

export function compactTrackSample(
  tRelSec: number,
  geo: GeoPoint,
): [number, number, number, number] {
  return [tRelSec, geo.lat, geo.lon, geo.altKm];
}
