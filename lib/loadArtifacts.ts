import type {
  ApproachesArtifact,
  CatalogMeta,
  RunMeta,
  StripArtifact,
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
  catalogMeta: CatalogMeta;
  runMeta: RunMeta;
};

export async function loadDemoArtifacts(): Promise<DemoArtifacts> {
  const [strip, approaches, catalogMeta, runMeta] = await Promise.all([
    fetchJson<StripArtifact>("/data/strip.json"),
    fetchJson<ApproachesArtifact>("/data/approaches.json"),
    fetchJson<CatalogMeta>("/data/catalog.meta.json"),
    fetchJson<RunMeta>("/data/run.meta.json"),
  ]);
  return { strip, approaches, catalogMeta, runMeta };
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
