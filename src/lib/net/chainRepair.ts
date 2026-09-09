import { request as httpsRequest } from "node:https";
import { rootCertificates } from "node:tls";

/**
 * Fetches from a host that serves an incomplete certificate chain, with
 * verification left fully on.
 *
 * traffic.sipa.gov.tw — the Science Park administration's traffic system, the
 * only plausible source of data for 園區 roads — fails with
 * UNABLE_TO_VERIFY_LEAF_SIGNATURE. That is not a bad certificate: the site's
 * leaf is issued by "TWCA Secure SSL Certification Authority", whose own root
 * is in the public trust store, but the server omits the intermediate that
 * links the two. Browsers paper over this by fetching the missing certificate
 * from the leaf's AIA extension; Node does not.
 *
 * So we do what the browser does: fetch that intermediate and hand it to the
 * TLS stack as an extra CA. Verification stays on, and the chain still has to
 * terminate at a root we already trust — a forged certificate fails exactly
 * as it should. The alternative, `rejectUnauthorized: false`, would accept
 * *any* certificate for that host and is never used here.
 *
 * Certificates are self-authenticating (they are only useful if they verify),
 * which is why AIA URLs are plain HTTP by design and why fetching one over
 * HTTP is safe.
 */

/** From the leaf's AIA extension, read off the live certificate — see /api/diagnostics/hsinchu-open-data. */
export const TWCA_INTERMEDIATE_AIA = "http://sslserver.twca.com.tw/cacert/secure_sha2_2023G3.crt";

const DER_TO_PEM_LINE = 64;

function derToPem(der: Buffer): string {
  const base64 = der.toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += DER_TO_PEM_LINE) {
    lines.push(base64.slice(i, i + DER_TO_PEM_LINE));
  }
  return `-----BEGIN CERTIFICATE-----\n${lines.join("\n")}\n-----END CERTIFICATE-----\n`;
}

let cachedIntermediate: string | null = null;

export async function loadIntermediate(aiaUrl = TWCA_INTERMEDIATE_AIA): Promise<string> {
  if (cachedIntermediate) return cachedIntermediate;
  const res = await fetch(aiaUrl, { cache: "no-store" });
  if (!res.ok) throw new Error(`AIA fetch failed: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  // AIA usually serves DER, but some CAs serve PEM at the same URL.
  const pem = bytes.subarray(0, 11).toString("ascii") === "-----BEGIN "
    ? bytes.toString("ascii")
    : derToPem(bytes);
  cachedIntermediate = pem;
  return pem;
}

export interface ChainRepairedResponse {
  status: number;
  contentType: string | null;
  body: string;
}

export async function fetchWithChainRepair(
  url: string,
  options: { timeoutMs?: number; maxBytes?: number; headers?: Record<string, string> } = {},
): Promise<ChainRepairedResponse> {
  const { timeoutMs = 20_000, maxBytes = 800_000, headers = {} } = options;
  const intermediate = await loadIntermediate();
  const target = new URL(url);

  return new Promise<ChainRepairedResponse>((resolve, reject) => {
    const req = httpsRequest(
      {
        host: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method: "GET",
        headers,
        // Setting `ca` REPLACES the default trust store, so the public roots
        // have to be included explicitly — otherwise this would trust the
        // intermediate's issuer and nothing else.
        ca: [intermediate, ...rootCertificates],
        servername: target.hostname,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total <= maxBytes) chunks.push(chunk);
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            contentType: (res.headers["content-type"] as string) ?? null,
            body: Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
    req.end();
  });
}
