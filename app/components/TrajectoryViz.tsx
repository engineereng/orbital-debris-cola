"use client";

import dynamic from "next/dynamic";
import { formatDuration } from "@/lib/loadArtifacts";
import type { ApproachRow, VizArtifact } from "@/lib/types";
import { VizErrorBoundary } from "./VizErrorBoundary";

const TrajectoryScene = dynamic(
  () =>
    import("./TrajectoryScene").then((m) => m.TrajectoryScene),
  {
    ssr: false,
    loading: () => (
      <div className="viz-canvas-fallback" aria-busy="true">
        Loading 3D trajectory…
      </div>
    ),
  },
);

type Props = {
  viz: VizArtifact;
  delayMinutes: number;
  approaches: ApproachRow[];
  keepOutKm: number;
  selectedNoradId: string | null;
  onSelectApproach: (noradId: string | null) => void;
};

export function TrajectoryViz({
  viz,
  delayMinutes,
  approaches,
  keepOutKm,
  selectedNoradId,
  onSelectApproach,
}: Props) {
  const entry = viz.byDelayMinutes[String(delayMinutes)];
  const selected =
    approaches.find((a) => a.noradId === selectedNoradId) ?? null;
  const breachCount = approaches.filter((a) => a.missKm < keepOutKm).length;

  return (
    <section className="panel viz-panel" aria-label="3D trajectory and neighborhood">
      <div className="panel-head">
        <h2>Primary trajectory · neighborhood</h2>
        <p>
          For selected T₀ (+{delayMinutes} min). Delay / “weather” in this demo only
          moves <strong>liftoff time</strong> — it does not reshape the vehicle
          profile. Absolute geometry vs catalog changes because Earth rotates and
          secondaries move.
        </p>
      </div>

      <div className="method-captions" aria-label="Method context">
        <span>Miss = 3D separation on 30 s grid</span>
        <span>Keep-out &lt; {keepOutKm} km → hold</span>
        <span>Pinned TLE catalog · simulated Nova-class</span>
        <span>Frame: ECEF · top-{approaches.length || "N"} neighborhood</span>
      </div>

      {!entry || entry.primaryEcef.length === 0 ? (
        <div className="state empty">
          No 3D track for this delay — regenerate with{" "}
          <code>npm run precompute</code>.
        </div>
      ) : (
        <div className="viz-stage">
          <VizErrorBoundary>
            <TrajectoryScene
              viz={viz}
              delayMinutes={delayMinutes}
              approaches={approaches}
              keepOutKm={keepOutKm}
              selectedNoradId={selectedNoradId}
              onSelectApproach={onSelectApproach}
            />
          </VizErrorBoundary>
          <div className="viz-overlay-legend" aria-hidden>
            <span className="leg pad">Pad</span>
            <span className="leg track">Primary path</span>
            <span className="leg sec">Secondary @ TCA</span>
            <span className="leg breach">Miss &lt; {keepOutKm} km</span>
          </div>
        </div>
      )}

      <p className="viz-stats mono">
        {breachCount > 0
          ? `${breachCount} keep-out breach${breachCount === 1 ? "" : "es"} in neighborhood`
          : "No keep-out breaches in top neighborhood"}{" "}
        · drag to orbit · scroll to zoom
      </p>

      {selected ? (
        <div className="viz-selected mono" role="status">
          <strong>{selected.name}</strong> ({selected.noradId}) · miss{" "}
          {selected.missKm.toFixed(2)} km · T₀ + {formatDuration(selected.tRelSec)}
          {selected.primary && selected.secondary
            ? ` · alt ${selected.primary.altKm.toFixed(0)}/${selected.secondary.altKm.toFixed(0)} km`
            : ""}
          <button
            type="button"
            className="viz-clear-sel"
            onClick={() => onSelectApproach(null)}
          >
            Clear
          </button>
        </div>
      ) : (
        <p className="viz-hint">
          Click a table row or a secondary in the scene to highlight that close
          approach (primary↔secondary segment at TCA).
        </p>
      )}
    </section>
  );
}
