"use client";

import { formatDuration, expandTrack } from "@/lib/loadArtifacts";
import type { ApproachRow, VizArtifact } from "@/lib/types";
import { useMemo } from "react";

type Props = {
  viz: VizArtifact;
  delayMinutes: number;
  approaches: ApproachRow[];
  keepOutKm: number;
  selectedNoradId: string | null;
  onSelectApproach: (noradId: string | null) => void;
};

/** Equirectangular project lon/lat into SVG viewBox. */
function project(
  lon: number,
  lat: number,
  bounds: { west: number; east: number; south: number; north: number },
  width: number,
  height: number,
  pad = 12,
): { x: number; y: number } {
  const x =
    pad +
    ((lon - bounds.west) / (bounds.east - bounds.west)) * (width - pad * 2);
  const y =
    pad +
    ((bounds.north - lat) / (bounds.north - bounds.south)) * (height - pad * 2);
  return { x, y };
}

function trackBounds(
  track: { lat: number; lon: number }[],
  pad: { lat: number; lon: number },
  markers: { lat: number; lon: number }[],
) {
  const lats = [pad.lat, ...track.map((p) => p.lat), ...markers.map((m) => m.lat)];
  const lons = [pad.lon, ...track.map((p) => p.lon), ...markers.map((m) => m.lon)];
  let west = Math.min(...lons);
  let east = Math.max(...lons);
  let south = Math.min(...lats);
  let north = Math.max(...lats);
  // Handle antimeridian sparsely — launch corridor stays Atlantic/Americas
  if (east - west < 8) {
    const mid = (east + west) / 2;
    west = mid - 4;
    east = mid + 4;
  } else {
    const padLon = (east - west) * 0.12;
    west -= padLon;
    east += padLon;
  }
  if (north - south < 6) {
    const mid = (north + south) / 2;
    south = mid - 3;
    north = mid + 3;
  } else {
    const padLat = (north - south) * 0.15;
    south -= padLat;
    north += padLat;
  }
  return { west, east, south, north };
}

export function TrajectoryViz({
  viz,
  delayMinutes,
  approaches,
  keepOutKm,
  selectedNoradId,
  onSelectApproach,
}: Props) {
  const entry = viz.byDelayMinutes[String(delayMinutes)];
  const track = useMemo(
    () => (entry ? expandTrack(entry.track) : []),
    [entry],
  );

  const markers = useMemo(() => {
    return approaches
      .filter((a) => a.primary && a.secondary)
      .map((a) => ({
        noradId: a.noradId,
        name: a.name,
        missKm: a.missKm,
        tRelSec: a.tRelSec,
        primary: a.primary!,
        secondary: a.secondary!,
        breach: a.missKm < keepOutKm,
      }));
  }, [approaches, keepOutKm]);

  const bounds = useMemo(
    () =>
      trackBounds(
        track,
        viz.pad,
        markers.flatMap((m) => [m.primary, m.secondary]),
      ),
    [track, viz.pad, markers],
  );

  const mapW = 640;
  const mapH = 320;
  const pathD = track
    .map((p, i) => {
      const { x, y } = project(p.lon, p.lat, bounds, mapW, mapH);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const ascentEnd = viz.ascentDurationSec;
  const maxT = viz.horizonSec;
  const maxAlt = Math.max(50, ...track.map((p) => p.altKm), ...markers.map((m) => Math.max(m.primary.altKm, m.secondary.altKm)));

  const chartW = 640;
  const chartH = 200;
  const chartPad = { l: 44, r: 12, t: 16, b: 32 };
  const innerW = chartW - chartPad.l - chartPad.r;
  const innerH = chartH - chartPad.t - chartPad.b;

  const altPath = track
    .map((p, i) => {
      const x = chartPad.l + (p.tRelSec / maxT) * innerW;
      const y = chartPad.t + innerH - (p.altKm / maxAlt) * innerH;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const selected = markers.find((m) => m.noradId === selectedNoradId) ?? null;
  const padPt = project(viz.pad.lon, viz.pad.lat, bounds, mapW, mapH);

  return (
    <section className="panel viz-panel" aria-label="Trajectory and close approaches">
      <div className="panel-head">
        <h2>Pad · trajectory · close approaches</h2>
        <p>
          For selected T₀ (+{delayMinutes} min). Weather in this demo only moves{" "}
          <strong>liftoff time</strong> — it does not reshape the vehicle profile.
          Absolute geometry vs catalog changes because Earth rotates and secondaries
          move.
        </p>
      </div>

      <div className="method-captions" aria-label="Method context">
        <span>Miss = 3D separation on 30 s grid</span>
        <span>Keep-out &lt; {keepOutKm} km → hold</span>
        <span>Pinned TLE catalog · simulated Nova-class</span>
      </div>

      {!entry || track.length === 0 ? (
        <div className="state empty">No track for this delay — regenerate viz artifacts.</div>
      ) : (
        <div className="viz-grid">
          <div className="viz-map-wrap">
            <h3 className="viz-subhead">Ground track</h3>
            <svg
              className="viz-svg"
              viewBox={`0 0 ${mapW} ${mapH}`}
              role="img"
              aria-label="Primary ground track map with pad and approach markers"
            >
              <rect className="viz-bg" x="0" y="0" width={mapW} height={mapH} rx="10" />
              {/* Lon/lat grid */}
              {[0.25, 0.5, 0.75].map((f) => {
                const lon = bounds.west + f * (bounds.east - bounds.west);
                const lat = bounds.south + f * (bounds.north - bounds.south);
                const v = project(lon, bounds.south, bounds, mapW, mapH);
                const v2 = project(lon, bounds.north, bounds, mapW, mapH);
                const h = project(bounds.west, lat, bounds, mapW, mapH);
                const h2 = project(bounds.east, lat, bounds, mapW, mapH);
                return (
                  <g key={f} className="viz-grid-lines">
                    <line x1={v.x} y1={v.y} x2={v2.x} y2={v2.y} />
                    <line x1={h.x} y1={h.y} x2={h2.x} y2={h2.y} />
                  </g>
                );
              })}
              <path className="viz-track" d={pathD} fill="none" />
              {/* Pad */}
              <g className="viz-pad">
                <circle cx={padPt.x} cy={padPt.y} r="6" />
                <circle cx={padPt.x} cy={padPt.y} r="11" className="viz-pad-ring" />
                <text x={padPt.x + 14} y={padPt.y + 4} className="viz-label">
                  Pad
                </text>
              </g>
              {/* Approach markers: primary (hollow) + secondary (filled) */}
              {markers.map((m) => {
                const p = project(m.primary.lon, m.primary.lat, bounds, mapW, mapH);
                const s = project(m.secondary.lon, m.secondary.lat, bounds, mapW, mapH);
                const active = m.noradId === selectedNoradId;
                const dimmed = selectedNoradId != null && !active;
                return (
                  <g
                    key={m.noradId}
                    className={`viz-approach ${m.breach ? "breach" : ""} ${active ? "active" : ""} ${dimmed ? "dimmed" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      onSelectApproach(active ? null : m.noradId)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectApproach(active ? null : m.noradId);
                      }
                    }}
                    aria-label={`${m.name} miss ${m.missKm.toFixed(1)} km`}
                  >
                    <line
                      className="viz-miss-link"
                      x1={p.x}
                      y1={p.y}
                      x2={s.x}
                      y2={s.y}
                    />
                    <circle className="viz-primary-dot" cx={p.x} cy={p.y} r={active ? 5 : 3.5} />
                    <circle className="viz-secondary-dot" cx={s.x} cy={s.y} r={active ? 6 : 4} />
                  </g>
                );
              })}
            </svg>
            <p className="viz-legend">
              <span className="leg pad">Pad</span>
              <span className="leg track">Primary track</span>
              <span className="leg sec">Secondary at TCA</span>
              <span className="leg pri">Primary at TCA</span>
            </p>
          </div>

          <div className="viz-alt-wrap">
            <h3 className="viz-subhead">Altitude vs time from T₀</h3>
            <svg
              className="viz-svg"
              viewBox={`0 0 ${chartW} ${chartH}`}
              role="img"
              aria-label="Primary altitude versus time with approach markers"
            >
              <rect className="viz-bg" x="0" y="0" width={chartW} height={chartH} rx="10" />
              {/* Ascent band */}
              <rect
                className="viz-ascent-band"
                x={chartPad.l}
                y={chartPad.t}
                width={(ascentEnd / maxT) * innerW}
                height={innerH}
              />
              {/* Axes */}
              <line
                className="viz-axis"
                x1={chartPad.l}
                y1={chartPad.t + innerH}
                x2={chartPad.l + innerW}
                y2={chartPad.t + innerH}
              />
              <line
                className="viz-axis"
                x1={chartPad.l}
                y1={chartPad.t}
                x2={chartPad.l}
                y2={chartPad.t + innerH}
              />
              <text className="viz-axis-label" x={chartPad.l - 6} y={chartPad.t + 4} textAnchor="end">
                {Math.round(maxAlt)} km
              </text>
              <text
                className="viz-axis-label"
                x={chartPad.l - 6}
                y={chartPad.t + innerH}
                textAnchor="end"
              >
                0
              </text>
              <text
                className="viz-axis-label"
                x={chartPad.l}
                y={chartH - 8}
                textAnchor="start"
              >
                T₀
              </text>
              <text
                className="viz-axis-label"
                x={chartPad.l + innerW}
                y={chartH - 8}
                textAnchor="end"
              >
                +{formatDuration(maxT)}
              </text>
              <text
                className="viz-axis-label ascent-tag"
                x={chartPad.l + 4}
                y={chartPad.t + 14}
              >
                Ascent
              </text>
              <path className="viz-alt-line" d={altPath} fill="none" />
              {markers.map((m) => {
                const x = chartPad.l + (m.tRelSec / maxT) * innerW;
                const yPri =
                  chartPad.t + innerH - (m.primary.altKm / maxAlt) * innerH;
                const ySec =
                  chartPad.t + innerH - (m.secondary.altKm / maxAlt) * innerH;
                const active = m.noradId === selectedNoradId;
                const dimmed = selectedNoradId != null && !active;
                return (
                  <g
                    key={m.noradId}
                    className={`viz-approach ${m.breach ? "breach" : ""} ${active ? "active" : ""} ${dimmed ? "dimmed" : ""}`}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      onSelectApproach(active ? null : m.noradId)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onSelectApproach(active ? null : m.noradId);
                      }
                    }}
                  >
                    <line className="viz-miss-link" x1={x} y1={yPri} x2={x} y2={ySec} />
                    <circle className="viz-primary-dot" cx={x} cy={yPri} r={active ? 5 : 3.5} />
                    <circle className="viz-secondary-dot" cx={x} cy={ySec} r={active ? 6 : 4} />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

      {selected ? (
        <div className="viz-selected mono" role="status">
          <strong>{selected.name}</strong> ({selected.noradId}) · miss{" "}
          {selected.missKm.toFixed(2)} km · T₀ + {formatDuration(selected.tRelSec)} ·
          primary {selected.primary.altKm.toFixed(0)} km / secondary{" "}
          {selected.secondary.altKm.toFixed(0)} km
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
          Click a table row or marker to highlight that close approach on the map
          and altitude chart.
        </p>
      )}
    </section>
  );
}
