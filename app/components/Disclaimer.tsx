export function Disclaimer() {
  return (
    <aside className="disclaimer" aria-label="Honesty disclaimer">
      <h2>Screening demo — not ops COLA</h2>
      <ul>
        <li>
          Portfolio COLA <em>screening</em> on a pinned TLE/GP catalog — not
          operational COLA, launch commit, or TraCSS.
        </li>
        <li>
          Miss-distance keep-out (&lt; 25 km) is a demo rule, not probability of
          collision or a range threshold.
        </li>
        <li>
          Catalog is a pinned TLE/GP-class snapshot (capped LEO subset). NASA does
          not recommend TLEs for operational Pc / mitigation.
        </li>
        <li>
          Vehicle path is a <strong>simulated</strong> Nova-class LEO insertion
          (Cape SLC-14 style) — not real Stoke flight data.
        </li>
        <li>
          Real CA/COLA uses CDMs, owner/operator ephemerides with covariance, and
          SP / High Accuracy Catalog inputs.
        </li>
      </ul>
    </aside>
  );
}
