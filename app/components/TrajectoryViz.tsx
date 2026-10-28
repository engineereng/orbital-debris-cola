"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import {
  computeLiveNeighborhood,
  formatDuration,
  primaryAtIndex,
  scrubIndexForTime,
} from "@/lib/loadArtifacts";
import type { ApproachRow, VizArtifact } from "@/lib/types";
import type { ScaleInfo } from "./TrajectoryScene";
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
  const scrubStep = viz.scrubStepSec ?? viz.trackStepSec;
  const maxT = viz.horizonSec;

  const [scrubTRelSec, setScrubTRelSec] = useState(0);
  const [scaleInfo, setScaleInfo] = useState<ScaleInfo | null>(null);

  // Reset scrub when delay changes; land near first TCA if available
  useEffect(() => {
    const first = approaches[0];
    const t =
      first && Number.isFinite(first.tRelSec)
        ? Math.round(first.tRelSec / scrubStep) * scrubStep
        : 0;
    setScrubTRelSec(Math.min(maxT, Math.max(0, t)));
  }, [delayMinutes, approaches, scrubStep, maxT]);

  // Selecting a secondary keeps scrub time t — camera pans in the 3D scene.

  const live = useMemo(
    () =>
      computeLiveNeighborhood(
        viz,
        delayMinutes,
        approaches,
        scrubTRelSec,
        keepOutKm,
      ),
    [viz, delayMinutes, approaches, scrubTRelSec, keepOutKm],
  );

  const liveSorted = useMemo(
    () => [...live].sort((a, b) => a.distKm - b.distKm),
    [live],
  );

  const breachAtT = live.filter((o) => o.breach).length;
  const selectedLive =
    live.find((o) => o.noradId === selectedNoradId) ?? null;
  const selectedRow =
    approaches.find((a) => a.noradId === selectedNoradId) ?? null;

  const scrubIdx = entry
    ? scrubIndexForTime(entry.primaryEcef, scrubTRelSec)
    : 0;
  const primaryNow = entry
    ? primaryAtIndex(entry.primaryEcef, scrubIdx)
    : null;
  const snappedT = primaryNow?.tRelSec ?? scrubTRelSec;

  return (
    <section className="panel viz-panel" aria-label="3D trajectory and neighborhood">
      <div className="panel-head">
        <h2>Primary trajectory · neighborhood</h2>
        <p>
          For selected T₀ (+{delayMinutes} min). Delay / “weather” only moves{" "}
          <strong>liftoff time</strong> — not the vehicle profile. Horizon scrub
          steps at <strong>{scrubStep} s</strong> (same grid as the path samples).
        </p>
      </div>

      <div className="method-captions" aria-label="Method context">
        <span>Miss / distance = 3D separation</span>
        <span>Keep-out &lt; {keepOutKm} km → highlight</span>
        <span>Scrub grid {scrubStep} s · top-{approaches.length || "N"}</span>
        <span>Pinned TLE · simulated Nova-class · ECEF</span>
      </div>

      {!entry || entry.primaryEcef.length === 0 ? (
        <div className="state empty">
          No 3D track for this delay — regenerate with{" "}
          <code>npm run precompute</code>.
        </div>
      ) : (
        <>
          <div className="horizon-scrub" aria-label="Screening horizon scrubber">
            <label className="horizon-scrub-label" htmlFor="horizon-scrub">
              <span className="k">Along horizon</span>
              <span className="v mono">
                T₀ + {formatDuration(snappedT)}
                <span className="muted"> · step {scrubStep}s</span>
              </span>
            </label>
            <input
              id="horizon-scrub"
              className="horizon-scrub-range"
              type="range"
              min={0}
              max={maxT}
              step={scrubStep}
              value={snappedT}
              onChange={(e) => setScrubTRelSec(Number(e.target.value))}
            />
            <div className="horizon-scrub-ends mono">
              <span>T₀</span>
              <span>+{formatDuration(maxT)}</span>
            </div>
          </div>

          <div className="viz-stage">
            <VizErrorBoundary>
              <TrajectoryScene
                viz={viz}
                delayMinutes={delayMinutes}
                approaches={approaches}
                keepOutKm={keepOutKm}
                selectedNoradId={selectedNoradId}
                scrubTRelSec={snappedT}
                onSelectApproach={onSelectApproach}
                onScaleInfo={setScaleInfo}
              />
            </VizErrorBoundary>
            <div className="viz-scale-bar" aria-label="Map scale">
              <div
                className="viz-scale-bar-line"
                style={{ width: scaleInfo ? `${Math.round(scaleInfo.barPx)}px` : "80px" }}
              />
              <div className="viz-scale-bar-label mono">
                {scaleInfo ? `${scaleInfo.labelKm} km` : "… km"}
                <span className="viz-scale-bar-unit"> · 1 unit = 1 km</span>
              </div>
            </div>
            <div className="viz-overlay-legend" aria-hidden>
              <span className="leg pad">Pad</span>
              <span className="leg track">Primary path</span>
              <span className="leg primary-now">Primary @ t</span>
              <span className="leg sec">Secondary @ t</span>
              <span className="leg breach">Dist &lt; {keepOutKm} km @ t</span>
            </div>
          </div>

          <div className="scrub-dist-panel">
            <h3 className="viz-subhead">Distance from primary at scrub time</h3>
            <ul className="scrub-dist-list">
              {liveSorted.slice(0, 8).map((o) => (
                <li
                  key={o.noradId}
                  className={`${o.breach ? "breach" : ""} ${o.noradId === selectedNoradId ? "selected" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      onSelectApproach(
                        o.noradId === selectedNoradId ? null : o.noradId,
                      )
                    }
                  >
                    <span className="name">{o.name}</span>
                    <span className="mono dist">{o.distKm.toFixed(1)} km</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <p className="viz-stats mono">
        {breachAtT > 0
          ? `${breachAtT} within keep-out at this t`
          : "No keep-out breaches at this t"}{" "}
        · drag to orbit · scroll to zoom
      </p>

      {selectedLive || selectedRow ? (
        <div className="viz-selected mono" role="status">
          <strong>{(selectedLive ?? selectedRow)!.name}</strong> (
          {(selectedLive ?? selectedRow)!.noradId})
          {selectedLive
            ? ` · dist @ t ${selectedLive.distKm.toFixed(2)} km`
            : ""}
          {selectedRow
            ? ` · TCA miss ${selectedRow.missKm.toFixed(2)} km @ T₀ + ${formatDuration(selectedRow.tRelSec)}`
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
          Scrub the horizon to eye-ball threats (camera follows primary @ t). Click
          a table row or secondary to frame that object with the primary at the{" "}
          <em>current</em> scrub time — scrub time does not jump to TCA.
        </p>
      )}
    </section>
  );
}
