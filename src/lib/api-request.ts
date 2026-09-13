import { ScanError } from "./scanner";

/** Bound JSON inputs even when clients omit Content-Length. */
export async function readJsonBody(
  request: Request,
): Promise<Record<string, unknown>> {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  // Next's development bind address can differ from the browser-facing Host.
  const hostOrigin = `${requestUrl.protocol}//${request.headers.get("host")}`;
  if (origin && origin !== requestUrl.origin && origin !== hostOrigin)
    throw new ScanError("Cross-origin writes are not permitted.", 403);
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new ScanError("Send a JSON request body.", 415);
  const maxBytes = 4096;
  if (Number(request.headers.get("content-length")) > maxBytes)
    throw new ScanError("The request body is too large.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ScanError("The request body must be a JSON object.");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ScanError("The request body is too large.", 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  try {
    const result: unknown = JSON.parse(text);
    if (!result || typeof result !== "object" || Array.isArray(result))
      throw new Error("Invalid object");
    return result as Record<string, unknown>;
  } catch {
    throw new ScanError("The request body must be a JSON object.");
  }
}
