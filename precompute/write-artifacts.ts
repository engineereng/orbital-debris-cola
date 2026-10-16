import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ApproachesArtifact,
  CatalogMeta,
  RunMeta,
  StripArtifact,
  VizArtifact,
} from "../lib/types";

export function writeArtifacts(opts: {
  artifactsDir: string;
  publicDataDir: string;
  strip: StripArtifact;
  approaches: ApproachesArtifact;
  viz: VizArtifact;
  runMeta: RunMeta;
  catalogMetaPath: string;
}): void {
  mkdirSync(opts.artifactsDir, { recursive: true });
  mkdirSync(opts.publicDataDir, { recursive: true });

  const files: Record<string, unknown> = {
    "strip.json": opts.strip,
    "approaches.json": opts.approaches,
    "viz.json": opts.viz,
    "run.meta.json": opts.runMeta,
  };

  for (const [name, data] of Object.entries(files)) {
    const json = JSON.stringify(data, null, 2) + "\n";
    writeFileSync(join(opts.artifactsDir, name), json);
    writeFileSync(join(opts.publicDataDir, name), json);
  }

  // Catalog meta for UI pin labels
  copyFileSync(opts.catalogMetaPath, join(opts.publicDataDir, "catalog.meta.json"));
  copyFileSync(opts.catalogMetaPath, join(opts.artifactsDir, "catalog.meta.json"));
}

export function buildRunMeta(partial: Omit<RunMeta, "generatedAtUtc"> & { generatedAtUtc?: string }): RunMeta {
  return {
    generatedAtUtc: partial.generatedAtUtc ?? new Date().toISOString(),
    ...partial,
  };
}

export type { CatalogMeta };
