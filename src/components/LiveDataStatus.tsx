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
  if (liveTraffic.status === "connecting") {
    text = "正在連線高速公路局即時路況…";
  } else if (liveTraffic.status === "live") {
    text = `國道路段即時路況已連線(${liveCount} 段)，更新於 ${time ?? "剛剛"}`;
  } else {
    text = time
      ? `即時路況目前無法連線，其餘路段沿用模擬路況(上次成功更新於 ${time})`
      : "即時路況目前無法連線，全部路段暫以模擬路況顯示";
  }

  return (
    <div className={`live-status is-${liveTraffic.status}`}>
      <span className="dot" />
      <span>{text}</span>
    </div>
  );
}
