interface SelectionPillsProps {
  originLabel: string | null;
  destLabel: string | null;
  onReset: () => void;
}

export function SelectionPills({ originLabel, destLabel, onReset }: SelectionPillsProps) {
  return (
    <div className="ctrl-row selection-row">
      <span className={`sel-pill${originLabel ? "" : " empty"}`}>
        <span className="k">出發</span>
        <span className="v">{originLabel ?? "點地圖選一個"}</span>
      </span>
      <span className={`sel-pill${destLabel ? "" : " empty"}`}>
        <span className="k">目的地</span>
        <span className="v">{destLabel ?? "點地圖選一個"}</span>
      </span>
      <button type="button" className="reset-btn" onClick={onReset}>
        清除選擇
      </button>
    </div>
  );
}
