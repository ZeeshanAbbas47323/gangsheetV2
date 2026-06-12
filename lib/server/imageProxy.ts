import { createHash } from "crypto";

/**
 * Shared proxy for external image-processing APIs (background removal,
 * upscaling). The external endpoint + key live in server-side env vars; the
 * browser only ever talks to our own /api/image/* routes.
 *
 * Default upstream contract (remove.bg-compatible, the de-facto standard):
 *   POST multipart/form-data, file field `image_file`, auth header `X-Api-Key`,
 *   response body = processed image bytes. If your provider differs, this
 *   function is the single place to adapt.
 */

interface ProxyParams {
  /** Data URL of the source image. */
  image: string;
  fileName: string;
  apiUrl: string;
  apiKey: string;
  /** Extra multipart fields some providers expect (e.g. size=auto). */
  extraFields?: Record<string, string>;
}

export class ImageProxyError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

interface CacheEntry {
  result: string;
  at: number;
}

/** Per-instance result cache so repeated operations don't re-bill the API. */
const cache = new Map<string, CacheEntry>();
const CACHE_MAX = 50;

function parseDataUrl(dataUrl: string): { buffer: Buffer; mime: string } {
  const match = /^data:([\w/+.-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) {
    throw new ImageProxyError("Invalid image payload.", 400);
  }
  return { buffer: Buffer.from(match[2], "base64"), mime: match[1] };
}

export async function proxyImageApi(params: ProxyParams): Promise<string> {
  const { buffer, mime } = parseDataUrl(params.image);
  if (buffer.length > 40 * 1024 * 1024) {
    throw new ImageProxyError("Image is too large to process (max 40 MB).", 413);
  }

  const key = `${params.apiUrl}:${createHash("sha256").update(buffer).digest("hex")}`;
  const hit = cache.get(key);
  if (hit) {
    hit.at = Date.now();
    return hit.result;
  }

  const form = new FormData();
  form.append(
    "image_file",
    new Blob([new Uint8Array(buffer)], { type: mime }),
    params.fileName || "image.png"
  );
  for (const [k, v] of Object.entries(params.extraFields ?? {})) {
    form.append(k, v);
  }

  let res: Response;
  try {
    res = await fetch(params.apiUrl, {
      method: "POST",
      headers: { "X-Api-Key": params.apiKey },
      body: form,
    });
  } catch {
    throw new ImageProxyError(
      "Could not reach the image processing service.",
      502
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const friendly =
      res.status === 402
        ? "The image API account is out of credits."
        : res.status === 401 || res.status === 403
          ? "The image API rejected the configured key."
          : `The image service failed (HTTP ${res.status}).`;
    console.error(`Image proxy upstream error ${res.status}: ${detail.slice(0, 500)}`);
    throw new ImageProxyError(friendly, 502);
  }

  const outType = res.headers.get("content-type")?.split(";")[0] ?? "image/png";
  if (!outType.startsWith("image/")) {
    throw new ImageProxyError(
      "The image service returned an unexpected response.",
      502
    );
  }
  const out = Buffer.from(await res.arrayBuffer());
  const result = `data:${outType};base64,${out.toString("base64")}`;

  cache.set(key, { result, at: Date.now() });
  if (cache.size > CACHE_MAX) {
    // evict least-recently used
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return result;
}
