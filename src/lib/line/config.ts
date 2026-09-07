/**
 * LINE Messaging API credentials (PRD §10.1 — LINE 官方帳號 + Messaging API,
 * not LINE Notify, which shut down 2025-03-31).
 *
 * Both values are server-only and must NOT carry a NEXT_PUBLIC_ prefix: the
 * channel secret is what proves a webhook really came from LINE, and the
 * access token can send messages as the official account. Shipping either to
 * the browser would hand both capabilities to every visitor.
 */
export interface LineCredentials {
  channelSecret: string;
  accessToken: string;
}

/** Signature verification needs only the secret, so it's readable on its own. */
export function readLineChannelSecret(): string | null {
  return process.env.LINE_CHANNEL_SECRET?.trim() || null;
}

export function readLineCredentials(): LineCredentials | null {
  const channelSecret = readLineChannelSecret();
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  if (!channelSecret || !accessToken) return null;
  return { channelSecret, accessToken };
}
