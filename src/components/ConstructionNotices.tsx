"use client";

import { useState } from "react";
import type { ConstructionResult } from "@/lib/live/types";

const COLLAPSED_COUNT = 3;

/**
 * 新竹市工務處的施工／交通管制公告。Today's items lead, because "今天出門會不會
 * 遇到施工" is the question this answers; the rest stay behind a toggle so the
 * card doesn't push the route recommendation off a phone screen.
 *
 * Renders nothing at all when the source is unavailable — an empty card would
 * imply "no roadworks today", which is a claim we can't make when we couldn't
 * read the board.
 */
export function ConstructionNotices({ construction }: { construction: ConstructionResult | null }) {
  const [expanded, setExpanded] = useState(false);

  if (!construction || construction.status !== "ok" || construction.notices.length === 0) {
    return null;
  }

  const today = construction.notices.filter((n) => n.isToday);
  const rest = construction.notices.filter((n) => !n.isToday);
  const shown = expanded ? rest : rest.slice(0, COLLAPSED_COUNT);

  return (
    <div className="card">
      <div className="notice-head">
        <span className="notice-title">新竹市施工／交通管制公告</span>
        <span className="notice-count">
          {today.length > 0 ? `今日 ${today.length} 則` : "今日無新公告"}
        </span>
      </div>

      {today.length > 0 && (
        <ul className="notice-list">
          {today.map((n) => (
            <li key={n.url} className="notice-item is-today">
              <span className="notice-badge">今日</span>
              <a href={n.url} target="_blank" rel="noopener noreferrer">
                {n.title}
              </a>
            </li>
          ))}
        </ul>
      )}

      {shown.length > 0 && (
        <ul className="notice-list">
          {shown.map((n) => (
            <li key={n.url} className="notice-item">
              <span className="notice-date mono">{n.date ?? "—"}</span>
              <a href={n.url} target="_blank" rel="noopener noreferrer">
                {n.title}
              </a>
            </li>
          ))}
        </ul>
      )}

      {rest.length > COLLAPSED_COUNT && (
        <button type="button" className="reset-btn" onClick={() => setExpanded(!expanded)}>
          {expanded ? "收合" : `其他 ${rest.length - COLLAPSED_COUNT} 則公告`}
        </button>
      )}

      <p className="notice-source">
        資料來源:
        <a href="https://publicworks.hsinchu.gov.tw/News.aspx?n=538&sms=8972" target="_blank" rel="noopener noreferrer">
          新竹市政府工務處最新消息
        </a>
        。公告未標示確切路段時，本站不會自動套用到路況模型。
      </p>
    </div>
  );
}
