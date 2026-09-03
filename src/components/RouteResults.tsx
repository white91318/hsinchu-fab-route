import { LEVEL_LABEL, levelVar } from "@/lib/traffic/model";
import { pathLabel } from "@/lib/routing/computePath";
import type { ComputedPath } from "@/lib/traffic/types";

interface RouteResultsProps {
  hasSelection: boolean;
  noRouteFound: boolean;
  best?: ComputedPath;
  other?: ComputedPath;
}

export function RouteResults({ hasSelection, noRouteFound, best, other }: RouteResultsProps) {
  if (!hasSelection) {
    return (
      <div className="card">
        <div className="empty-state">選好出發地和目的地之後,建議路線會顯示在這裡。</div>
      </div>
    );
  }

  if (noRouteFound || !best) {
    return (
      <div className="card">
        <div className="empty-state">這兩點之間目前的路網原型還沒有連通路線,先試試別的組合。</div>
      </div>
    );
  }

  const diff = other ? other.total - best.total : 0;
  let reasonLine: string;
  if (best.worst.minutes - best.worst.base < 1) {
    reasonLine =
      !other || diff <= 1
        ? "這個時間點沿線多為順暢路段,選你順路的即可。"
        : "這個時間點沿線多為順暢路段,差異主要來自路線長短,而非塞車。";
  } else {
    reasonLine = `主要延誤在「${best.worst.name}」路段,目前${LEVEL_LABEL[best.worst.level]}（${best.worst.reason}）。`;
  }

  const routes = other ? [best, other] : [best];

  return (
    <>
      <div className="rec-card">
        <div className="rec-eyebrow">建議路線</div>
        <div className="rec-main">
          <span className="route-name">{pathLabel(best)}</span>
          <span className="time mono">約 {best.total} 分鐘</span>
          {other && <span className="delta">比另一條快 {Math.max(diff, 0)} 分鐘</span>}
        </div>
        <div className="rec-reason">{reasonLine}</div>
      </div>
      <div className="routes">
        {routes.map((route) => (
          <RouteCard key={route.edgeIds.join(",")} route={route} isBest={route === best} />
        ))}
      </div>
    </>
  );
}

function RouteCard({ route, isBest }: { route: ComputedPath; isBest: boolean }) {
  return (
    <div className={`route-card${isBest ? " is-best" : ""}`}>
      <div className="head">
        <span className="name">{pathLabel(route)}</span>
        {isBest && <span className="best-tag">建議</span>}
      </div>
      <div className="total mono">
        {route.total}
        <span className="u">分鐘</span>
      </div>
      <div className="chip-list">
        {route.display.map((s, i) => (
          <div className="chip" key={`${s.id}-${i}`}>
            <span className="sw" style={{ background: levelVar(s.level) }} />
            <span className="seg-name">{s.name}</span>
            <span className={`seg-tag tag-${s.level}`}>{LEVEL_LABEL[s.level]}</span>
            <span className="seg-min mono">{s.minutes} 分</span>
          </div>
        ))}
      </div>
    </div>
  );
}
