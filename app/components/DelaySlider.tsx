"use client";

type Props = {
  delayMinutes: number;
  maxMinutes: number;
  selectedT0Utc: string;
  status: "hold" | "clear";
  minMissKm: number;
  onChange: (delayMinutes: number) => void;
};

export function DelaySlider({
  delayMinutes,
  maxMinutes,
  selectedT0Utc,
  status,
  minMissKm,
  onChange,
}: Props) {
  return (
    <section className="panel slider-panel" aria-label="Liftoff delay control">
      <div className="panel-head">
        <h2>Liftoff delay</h2>
        <p>
          Scrub +minutes from window open · screening horizon stays ascent + ~3 h.
          Delay shifts <strong>when</strong> you lift off — not the vehicle shape.
        </p>
      </div>
      <div className="slider-row">
        <label className="delay-value" htmlFor="delay-slider">
          <span className="delay-num">+{delayMinutes}</span>
          <span className="delay-unit">min</span>
        </label>
        <input
          id="delay-slider"
          className="delay-slider"
          type="range"
          min={0}
          max={maxMinutes}
          step={1}
          value={delayMinutes}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </div>
      <dl className="t0-meta">
        <div>
          <dt>Selected T₀</dt>
          <dd>{selectedT0Utc.replace(".000Z", "Z")}</dd>
        </div>
        <div>
          <dt>Strip status</dt>
          <dd className={status}>{status}</dd>
        </div>
        <div>
          <dt>Min miss</dt>
          <dd>{minMissKm.toFixed(2)} km</dd>
        </div>
      </dl>
    </section>
  );
}
