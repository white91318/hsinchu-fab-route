import { NextResponse } from "next/server";
import { readLineChannelSecret } from "@/lib/line/config";
import { replyMessage, type LineTextMessage } from "@/lib/line/client";
import { verifyLineSignature } from "@/lib/line/signature";

export const dynamic = "force-dynamic";

/** Only the fields we actually read — LINE sends a great deal more. */
interface LineWebhookEvent {
  type: string;
  replyToken?: string;
  source?: { userId?: string };
  message?: { type?: string; text?: string };
}

const WELCOME: LineTextMessage = {
  type: "text",
  text: [
    "歡迎加入上工路 🚗",
    "",
    "這個帳號只做一件事:你的通勤路線今天跟平常不一樣的時候,在你出門前告訴你。",
    "",
    "目前還在累積路況基準線(要有「平常」才知道什麼叫「不一樣」),警報功能還沒開始運作。",
    "在那之前,可以先看路網圖:https://hsinchu-fab-route.vercel.app",
  ].join("\n"),
};

const HOLDING: LineTextMessage = {
  type: "text",
  text: [
    "還在累積基準線資料,對話式查詢還沒開放。",
    "現在可以先用路網圖看各路段狀況:https://hsinchu-fab-route.vercel.app",
  ].join("\n"),
};

/**
 * LINE Messaging API webhook (PRD §6, §10.1).
 *
 * Scope today is deliberately small: verify the signature, acknowledge the
 * event, and answer honestly that alerts don't work yet. The daily summary
 * (§6.1) and anomaly alerts (§6.2) both compare against a baseline, and M0
 * is still accumulating the ≥4 weeks needed to compute one — so replying as
 * though they worked would be inventing the one thing this product sells.
 */
export async function POST(request: Request) {
  const channelSecret = readLineChannelSecret();
  if (!channelSecret) {
    // No secret means no way to tell a real LINE request from a forged one,
    // so nothing here is safe to act on.
    return NextResponse.json({ status: "not-configured" }, { status: 503 });
  }

  // Must be the raw bytes: re-serialising parsed JSON changes the string the
  // signature was computed over.
  const rawBody = await request.text();
  if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"), channelSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let events: LineWebhookEvent[] = [];
  try {
    const parsed = JSON.parse(rawBody) as { events?: LineWebhookEvent[] };
    events = Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return NextResponse.json({ error: "malformed body" }, { status: 400 });
  }

  // Handled concurrently, and failures are swallowed per event: LINE retries
  // (and eventually disables) a webhook that doesn't return 200 promptly, so
  // one failed reply must not take the whole delivery down with it.
  await Promise.all(
    events.map(async (event) => {
      if (!event.replyToken) return;
      if (event.type === "follow") {
        await replyMessage(event.replyToken, [WELCOME]);
      } else if (event.type === "message" && event.message?.type === "text") {
        await replyMessage(event.replyToken, [HOLDING]);
      }
    }),
  );

  return NextResponse.json({ status: "ok", handled: events.length });
}
