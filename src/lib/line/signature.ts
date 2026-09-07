import crypto from "node:crypto";

/**
 * Verifies the `x-line-signature` header on a Messaging API webhook.
 *
 * LINE signs the webhook with HMAC-SHA256 over the **raw request body**,
 * keyed by the channel secret, base64-encoded. Two details matter and are
 * easy to get wrong:
 *
 * - The body must be the exact bytes received. Parsing to JSON and
 *   re-serialising can reorder keys or change spacing, and the signature
 *   then never matches — so the caller passes the string from
 *   `request.text()`, before any parsing.
 * - The comparison is timing-safe. A plain `===` leaks, through response
 *   timing, how much of a guessed signature was correct, which is enough to
 *   forge one byte at a time.
 *
 * An unsigned or mismatched request is not ours to process: without this
 * check, anyone who learns the webhook URL can post fabricated events.
 */
export function verifyLineSignature(
  rawBody: string,
  signature: string | null | undefined,
  channelSecret: string,
): boolean {
  if (!signature) return false;

  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody, "utf8").digest("base64");

  const received = Buffer.from(signature, "base64");
  const computed = Buffer.from(expected, "base64");
  // timingSafeEqual throws on length mismatch, so the lengths are compared
  // first — that comparison leaks nothing beyond the signature's length.
  if (received.length !== computed.length) return false;
  return crypto.timingSafeEqual(received, computed);
}
