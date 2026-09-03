export function MapLegend() {
  return (
    <div className="map-legend">
      <span className="lg">
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
          <circle cx={8} cy={8} r={5.5} fill="none" stroke="currentColor" strokeWidth={2.5} />
        </svg>
        出發地
      </span>
      <span className="lg">
        <svg width={16} height={16} viewBox="0 0 16 16" aria-hidden="true">
          <rect x={2.5} y={2.5} width={11} height={11} rx={3} fill="none" stroke="currentColor" strokeWidth={2.5} />
        </svg>
        目的地(園區入口)
      </span>
      <span className="lg">
        <svg width={28} height={16} viewBox="0 0 28 16" aria-hidden="true">
          <rect x={1.5} y={3.5} width={25} height={9} rx={4.5} fill="none" stroke="currentColor" strokeWidth={2} />
        </svg>
        交流道／轉運點
      </span>
      <span className="lg">
        <span className="lg-line" />
        線條顏色＝目前壅塞程度
      </span>
    </div>
  );
}
