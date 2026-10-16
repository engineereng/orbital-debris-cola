"use client";

import { formatDuration } from "@/lib/loadArtifacts";
import type { ApproachRow } from "@/lib/types";

type Props = {
  rows: ApproachRow[];
  keepOutKm: number;
  status: "hold" | "clear";
  loading?: boolean;
  selectedNoradId?: string | null;
  onSelect?: (noradId: string | null) => void;
};

export function ApproachTable({
  rows,
  keepOutKm,
  status,
  loading,
  selectedNoradId = null,
  onSelect,
}: Props) {
  return (
    <section className="panel table-panel" aria-label="Close approaches">
      <div className="panel-head">
        <h2>Top close approaches</h2>
        <p>
          For selected T₀ · miss distance = 3D separation on 30 s grid · keep-out{" "}
          {keepOutKm} km
        </p>
      </div>

      {loading ? (
        <div className="state loading">Loading approach rows…</div>
      ) : rows.length === 0 ? (
        <div className="state empty">
          No approach rows for this T₀. Artifacts may be incomplete — regenerate with{" "}
          <code>npm run precompute</code>.
        </div>
      ) : status === "clear" && rows[0].missKm >= keepOutKm ? (
        <>
          <div className="state empty-ok">
            No keep-out breaches in top-{rows.length} — min miss{" "}
            {rows[0].missKm.toFixed(2)} km (≥ {keepOutKm} km).
          </div>
          <Table
            rows={rows}
            keepOutKm={keepOutKm}
            selectedNoradId={selectedNoradId}
            onSelect={onSelect}
          />
        </>
      ) : (
        <Table
          rows={rows}
          keepOutKm={keepOutKm}
          selectedNoradId={selectedNoradId}
          onSelect={onSelect}
        />
      )}
    </section>
  );
}

function Table({
  rows,
  keepOutKm,
  selectedNoradId,
  onSelect,
}: {
  rows: ApproachRow[];
  keepOutKm: number;
  selectedNoradId: string | null;
  onSelect?: (noradId: string | null) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>NORAD</th>
            <th>Name</th>
            <th>Miss</th>
            <th>Along horizon</th>
            <th>At TCA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const selected = r.noradId === selectedNoradId;
            return (
              <tr
                key={r.noradId}
                className={`${r.missKm < keepOutKm ? "breach" : ""} ${selected ? "selected-row" : ""}`}
                onClick={() =>
                  onSelect?.(selected ? null : r.noradId)
                }
                onKeyDown={(e) => {
                  if (!onSelect) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(selected ? null : r.noradId);
                  }
                }}
                tabIndex={onSelect ? 0 : undefined}
                aria-selected={selected}
              >
                <td className="mono">{r.noradId}</td>
                <td>{r.name}</td>
                <td className="mono">{r.missKm.toFixed(2)} km</td>
                <td className="mono">T₀ + {formatDuration(r.tRelSec)}</td>
                <td className="mono muted">
                  {r.primary && r.secondary
                    ? `${r.primary.altKm.toFixed(0)}/${r.secondary.altKm.toFixed(0)} km`
                    : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
