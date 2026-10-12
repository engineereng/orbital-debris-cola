"use client";

import type { StripCell } from "@/lib/types";

type Props = {
  cells: StripCell[];
  delayMinutes: number;
  keepOutKm: number;
  onSelect: (delayMinutes: number) => void;
};

export function RiskStrip({ cells, delayMinutes, keepOutKm, onSelect }: Props) {
  return (
    <section className="panel strip-panel" aria-label="Launch window risk strip">
      <div className="panel-head">
        <h2>Window risk strip</h2>
        <p>
          2 h open window · 1 min samples · hold when any miss &lt; {keepOutKm} km
        </p>
      </div>
      <div
        className="risk-strip"
        role="listbox"
        aria-label="Liftoff delay cells"
        aria-activedescendant={`strip-cell-${delayMinutes}`}
      >
        {cells.map((cell) => {
          const selected = cell.delayMinutes === delayMinutes;
          return (
            <button
              key={cell.delayMinutes}
              id={`strip-cell-${cell.delayMinutes}`}
              type="button"
              role="option"
              aria-selected={selected}
              title={`+${cell.delayMinutes} min · ${cell.status} · min miss ${cell.minMissKm} km`}
              className={[
                "strip-cell",
                cell.status,
                selected ? "selected" : "",
              ].join(" ")}
              onClick={() => onSelect(cell.delayMinutes)}
            />
          );
        })}
      </div>
      <div className="strip-legend">
        <span>
          <i className="swatch clear" /> Clear
        </span>
        <span>
          <i className="swatch hold" /> Hold (&lt; {keepOutKm} km)
        </span>
        <span>
          <i className="swatch selected-mark" /> Selected T₀
        </span>
        <span className="strip-scale">+0 min ——— window ——— +120 min</span>
      </div>
    </section>
  );
}
