import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

/** Conservative globally routable addresses only; reject mapped/transition IPv6. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes(".")) return false;
  const first = parseInt(address.split(":")[0] || "0", 16);
  if (first < 0x2000 || first > 0x3fff || first === 0x2002) return false;
  const second = parseInt(address.split(":")[1] || "0", 16);
  // IETF protocol assignments (including Teredo), documentation and benchmarking.
  return !(first === 0x2001 && (second <= 0x1ff || second === 0xdb8)) &&
    !(first === 0x3fff && second <= 0xfff);
}

export function publicAddresses(records: { address: string; family: number }[]) {
  if (!records.length || records.some(record => !isPublicAddress(record.address)))
    throw new Error("The website must resolve only to public internet addresses.");
  return records;
}

/** Never use an unvalidated second DNS resolution for a Node connection. */
export const publicFetch: typeof fetch = async (input, init) => {
  // Deployed Workers have global_fetch_strictly_public enabled. Global fetch,
  // not a service/VPC binding, enforces public egress at connection time.
  if (typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers")
    return fetch(input, init);
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.protocol !== "https:") throw new Error("HTTPS required.");
  return new Promise<Response>((resolve, reject) => {
    const req = request(url, {
      method: "GET", agent: false, signal: init?.signal ?? undefined,
      headers: Object.fromEntries(new Headers(init?.headers)),
      lookup(hostname, options, callback) {
        lookup(hostname, { all: true }).then(records => {
          const safe = publicAddresses(records);
          if (options.all) callback(null, safe);
          else { const chosen = safe.find(record => record.family === 4) ?? safe[0]; callback(null, chosen.address, chosen.family); }
        }).catch(error => callback(error, "", 4));
      },
    }, response => {
      const headers = new Headers();
      for (const [key, value] of Object.entries(response.headers))
        if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
      const status = response.statusCode ?? 502;
      if ([204, 205, 304].includes(status)) {
        response.resume(); resolve(new Response(null, { status, headers }));
      } else resolve(new Response(Readable.toWeb(response) as ReadableStream<Uint8Array>, { status, headers }));
    });
    req.on("error", reject); req.end();
  });
};
