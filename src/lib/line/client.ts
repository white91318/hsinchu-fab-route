import { readLineCredentials } from "@/lib/line/config";

const LINE_API_BASE = "https://api.line.me/v2/bot";
const REQUEST_TIMEOUT_MS = 8000;

/** Only text messages so far — the daily summary (PRD §6.1) will add Flex bubbles later. */
export interface LineTextMessage {
  type: "text";
  text: string;
}

export type LineSendResult =
  | { status: "ok" }
  | { status: "not-configured"; error: string }
  | { status: "unavailable"; error: string };

async function post(path: string, body: unknown): Promise<LineSendResult> {
  const creds = readLineCredentials();
  if (!creds) {
    return { status: "not-configured", error: "未設定 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${LINE_API_BASE}${path}`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${creds.accessToken}`,
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!res.ok) {
      // LINE puts a human-readable reason in the body; keep it, it's the
      // difference between "bad token" and "this reply token expired".
      const detail = await res.text().catch(() => "");
      return { status: "unavailable", error: `HTTP ${res.status}${detail ? `:${detail.slice(0, 200)}` : ""}` };
    }
    return { status: "ok" };
  } catch (err) {
    return { status: "unavailable", error: err instanceof Error ? err.message : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Replies to an event. The reply token is single-use and short-lived, so this
 * is only valid in direct response to a webhook event — anything scheduled
 * (the daily summary, an anomaly alert) has to use `pushMessage` instead.
 */
export function replyMessage(replyToken: string, messages: LineTextMessage[]): Promise<LineSendResult> {
  return post("/message/reply", { replyToken, messages });
}

/** Sends to one user unprompted — this is what the scheduled alerts will use. */
export function pushMessage(to: string, messages: LineTextMessage[]): Promise<LineSendResult> {
  return post("/message/push", { to, messages });
}

export type LineBotInfoProbe =
  | { status: "not-configured"; error: string }
  | { status: "ok"; httpStatus: number; basicId?: string; displayName?: string; chatMode?: string }
  | { status: "unavailable"; httpStatus?: number; error: string };

/**
 * Read-only check that the access token actually works, by asking LINE who
 * this bot is. Sends no messages, so it's safe to call from a diagnostics
 * endpoint — the alternative way to find out a token is wrong is to discover
 * it when the first real alert silently fails to send.
 *
 * Only the account's public identity is reported back (the @id and display
 * name anyone can see by searching for it in LINE); the token itself never
 * leaves the server.
 */
export async function fetchLineBotInfo(): Promise<LineBotInfoProbe> {
  const creds = readLineCredentials();
  if (!creds) {
    return { status: "not-configured", error: "未設定 LINE_CHANNEL_SECRET / LINE_CHANNEL_ACCESS_TOKEN" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${LINE_API_BASE}/info`, {
      signal: controller.signal,
      headers: { authorization: `Bearer ${creds.accessToken}` },
      cache: "no-store",
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        status: "unavailable",
        httpStatus: res.status,
        error: body.slice(0, 200) || `HTTP ${res.status}`,
      };
    }
    const info = JSON.parse(body) as { basicId?: string; displayName?: string; chatMode?: string };
    return {
      status: "ok",
      httpStatus: res.status,
      basicId: info.basicId,
      displayName: info.displayName,
      chatMode: info.chatMode,
    };
  } catch (err) {
    return { status: "unavailable", error: err instanceof Error ? err.message : "request failed" };
  } finally {
    clearTimeout(timer);
  }
}
