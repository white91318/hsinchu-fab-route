import type { LiveTrafficState } from "@/hooks/useLiveTraffic";

function fmtTime(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" });
}

export function LiveDataStatus({ liveTraffic, liveCount }: { liveTraffic: LiveTrafficState; liveCount: number }) {
  const time = fmtTime(liveTraffic.lastUpdated);

  let text: string;
  switch (liveTraffic.status) {
    case "connecting":
      text = "正在連線 TDX 國道即時路況…";
      break;
    case "live":
      text = `國道路段即時路況已連線(${liveCount} 段)，更新於 ${time ?? "剛剛"}`;
      break;
    case "not-configured":
      // Distinct from a failure — nothing is broken, the key just isn't set yet.
      text = "尚未設定 TDX 憑證，全部路段以模擬路況顯示";
      break;
    default:
      text = time
        ? `即時路況目前無法連線，沿用上次成功的資料(${time})`
        : "即時路況目前無法連線，全部路段暫以模擬路況顯示";
  }

  return (
    <div className={`live-status is-${liveTraffic.status}`}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}
