"use client";

import { formatDuration } from "@/lib/loadArtifacts";
import type { ApproachRow } from "@/lib/types";

type Props = {
  rows: ApproachRow[];
  keepOutKm: number;
  status: "hold" | "clear";
  loading?: boolean;
};

export function ApproachTable({ rows, keepOutKm, status, loading }: Props) {
  return (
    <section className="panel table-panel" aria-label="Close approaches">
      <div className="panel-head">
        <h2>Top close approaches</h2>
        <p>For selected T₀ · miss distance along ascent + ~3 h horizon</p>
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
          <Table rows={rows} keepOutKm={keepOutKm} />
        </>
      ) : (
        <Table rows={rows} keepOutKm={keepOutKm} />
      )}
    </section>
  );
}

function Table({ rows, keepOutKm }: { rows: ApproachRow[]; keepOutKm: number }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>NORAD</th>
            <th>Name</th>
            <th>Miss</th>
            <th>Along horizon</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.noradId} className={r.missKm < keepOutKm ? "breach" : ""}>
              <td className="mono">{r.noradId}</td>
              <td>{r.name}</td>
              <td className="mono">{r.missKm.toFixed(2)} km</td>
              <td className="mono">T₀ + {formatDuration(r.tRelSec)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
