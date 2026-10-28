"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addMinutesIso,
  loadDemoArtifacts,
  type DemoArtifacts,
} from "@/lib/loadArtifacts";
import { ApproachTable } from "./ApproachTable";
import { DelaySlider } from "./DelaySlider";
import { Disclaimer } from "./Disclaimer";
import { RiskStrip } from "./RiskStrip";
import { TrajectoryViz } from "./TrajectoryViz";

export function DemoApp() {
  const [data, setData] = useState<DemoArtifacts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [delayMinutes, setDelayMinutes] = useState(0);
  const [selectedNoradId, setSelectedNoradId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadDemoArtifacts()
      .then((arts) => {
        if (cancelled) return;
        setData(arts);
        // Land slider on first hold for a punchy demo entry, else 0
        const firstHold = arts.strip.cells.find((c) => c.status === "hold");
        if (firstHold) setDelayMinutes(firstHold.delayMinutes);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load demo artifacts");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clear approach highlight when T₀ changes
  useEffect(() => {
    setSelectedNoradId(null);
  }, [delayMinutes]);

  const selectedCell = data?.strip.cells[delayMinutes];
  const approaches = useMemo(() => {
    if (!data) return [];
    return data.approaches.byDelayMinutes[String(delayMinutes)] ?? [];
  }, [data, delayMinutes]);

  const selectedT0Utc = data
    ? addMinutesIso(data.strip.windowStartUtc, delayMinutes)
    : "";

  const handleDelayChange = (d: number) => {
    setDelayMinutes(d);
  };

  return (
    <div className="demo-shell">
      <header className="hero">
        <div className="hero-atmosphere" aria-hidden />
        <div className="hero-inner">
          <p className="brand">Cape COLA</p>
          <h1>Nova-class launch-window screening</h1>
          <p className="lede">
            Build in WA, fly from the Cape — scrub a 2-hour window against a pinned
            LEO catalog. Screening demo, not ops COLA.
          </p>
          <div className="hero-cta">
            <a className="btn primary" href="#strip">
              Scrub the window
            </a>
            <a className="btn ghost" href="#disclaimer">
              Read honesty notes
            </a>
          </div>
        </div>
      </header>

      <main className="main">
        {error ? (
          <div className="state error" role="alert">
            <strong>Artifact load failed.</strong> {error} Commit{" "}
            <code>public/data/*.json</code> or run <code>npm run precompute</code>.
          </div>
        ) : !data || !selectedCell ? (
          <div className="state loading panels-skeleton" aria-busy="true">
            <div className="skel" />
            <div className="skel" />
            <div className="skel" />
          </div>
        ) : (
          <>
            <section className="pin-bar" aria-label="Pinned demo meta">
              <div>
                <span className="k">Window open</span>
                <span className="v mono">
                  {data.strip.windowStartUtc.replace(".000Z", "Z")}
                </span>
              </div>
              <div>
                <span className="k">Catalog pin</span>
                <span className="v">
                  {data.catalogMeta.objectCount} LEO objects · perigee &lt; 2000 km
                  {data.catalogMeta.demoCap
                    ? ` · demo subset of ${data.catalogMeta.totalCandidatesBeforeCap}`
                    : ""}
                </span>
              </div>
              <div>
                <span className="k">Catalog epoch</span>
                <span className="v mono">
                  {data.catalogMeta.pinnedEpochUtc.replace(/\.\d+Z$/, "Z")}
                </span>
              </div>
              <div>
                <span className="k">Horizon</span>
                <span className="v">{data.strip.screeningHorizonLabel}</span>
              </div>
            </section>

            <div id="strip">
              <RiskStrip
                cells={data.strip.cells}
                delayMinutes={delayMinutes}
                keepOutKm={data.strip.keepOutKm}
                onSelect={handleDelayChange}
              />
            </div>

            <DelaySlider
              delayMinutes={delayMinutes}
              maxMinutes={data.strip.windowMinutes}
              selectedT0Utc={selectedT0Utc}
              status={selectedCell.status}
              minMissKm={selectedCell.minMissKm}
              onChange={handleDelayChange}
            />

            <div id="viz">
              <TrajectoryViz
                viz={data.viz}
                delayMinutes={delayMinutes}
                approaches={approaches}
                keepOutKm={data.strip.keepOutKm}
                selectedNoradId={selectedNoradId}
                onSelectApproach={setSelectedNoradId}
              />
            </div>

            <ApproachTable
              rows={approaches}
              keepOutKm={data.strip.keepOutKm}
              status={selectedCell.status}
              selectedNoradId={selectedNoradId}
              onSelect={setSelectedNoradId}
            />
          </>
        )}

        <div id="disclaimer">
          <Disclaimer />
        </div>
      </main>

      <footer className="site-foot">
        <span>orbital-debris-cola · v1 screening slice</span>
        <span>Shell congestion → v2 · no live SSA APIs</span>
      </footer>
    </div>
  );
}
