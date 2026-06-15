import { log } from "console";
import { createHash } from "crypto";

/**
 * Shared proxy for external image-processing APIs (ClipDrop: background
 * removal, upscaling, smart cropping). The endpoint + key live in server-side
 * env vars; the browser only ever talks to our own /api/image/* routes.
 *
 * Upstream contract (ClipDrop / remove.bg compatible):
 *   POST multipart/form-data, file field `image_file`, auth header `x-api-key`,
 *   response body = processed image bytes. Adapt this file for other providers.
 */

// UPDATED: ClipDrop services per the official API collection. ClipDrop has no
// "crop" endpoint (crop is done client-side); it offers Remove Text instead.
export type ClipdropOp = "remove-bg" | "upscale" | "remove-text";

interface ClipdropEndpoint {
  /** Default ClipDrop URL; overridable per-op via env. */
  defaultUrl: string;
  urlEnv: string;
}

/** ClipDrop endpoints. A single CLIPDROP_API_KEY authorises all of them. */
export const CLIPDROP_ENDPOINTS: Record<ClipdropOp, ClipdropEndpoint> = {
  "remove-bg": {
    defaultUrl: "https://clipdrop-api.co/remove-background/v1",
    urlEnv: "CLIPDROP_REMOVE_BG_URL",
  },
  upscale: {
    defaultUrl: "https://clipdrop-api.co/image-upscaling/v1/upscale",
    urlEnv: "CLIPDROP_UPSCALE_URL",
  },
  "remove-text": {
    defaultUrl: "https://clipdrop-api.co/remove-text/v1",
    urlEnv: "CLIPDROP_REMOVE_TEXT_URL",
  },
};

interface RouteResult {
  status: number;
  json: { image?: string; error?: string };
}

/**
 * End-to-end handler used by every /api/image/* route: validates env + body,
 * proxies to ClipDrop, and returns a JSON-ready result. Keeps route files thin.
 */
export async function runClipdropRoute(
  op: ClipdropOp,
  body: { image?: string; fileName?: string; targetWidth?: number; targetHeight?: number }
): Promise<RouteResult> {
  const apiKey = process.env.CLIPDROP_API_KEY;
  const endpoint = CLIPDROP_ENDPOINTS[op];
  const apiUrl = process.env[endpoint.urlEnv] || endpoint.defaultUrl;

  if (!apiKey || !apiUrl) {
    return {
      status: 503,
      json: {
        error: `${op} is not configured. Set CLIPDROP_API_KEY${apiUrl ? "" : ` and ${endpoint.urlEnv}`} in .env.local.`,
      },
    };
  }
  if (!body.image) {
    return { status: 400, json: { error: "Missing image data." } };
  }

  // FIX: ClipDrop endpoints reject unknown fields. remove-bg and remove-text
  // take only `image_file`; upscale additionally needs target_width/height.
  const extraFields: Record<string, string> = {};
  if (op === "upscale") {
    extraFields.target_width = String(Math.round(body.targetWidth ?? 2048));
    extraFields.target_height = String(Math.round(body.targetHeight ?? 2048));
  }

  try {
    const image = await proxyImageApi({
      image: body.image,
      fileName: body.fileName ?? "image.png",
      apiUrl,
      apiKey,
      extraFields,
    });
    return { status: 200, json: { image } };
  } catch (err) {
    if (err instanceof ImageProxyError) {
      return { status: err.status, json: { error: err.message } };
    }
    console.error(`${op} route error:`, err);
    return { status: 500, json: { error: `${op} failed unexpectedly.` } };
  }
}

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
  console.log(params.apiUrl);
  console.log(params.apiKey);
  
  try {
    res = await fetch(params.apiUrl, {
      method: "POST",
      headers: { "x-api-key": params.apiKey },
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
    // ClipDrop returns a JSON { error } body — surface it so failures are
    // actionable instead of a generic message.
    let upstreamMsg = "";
    try {
      upstreamMsg = (JSON.parse(detail) as { error?: string }).error ?? "";
    } catch {
      upstreamMsg = detail.slice(0, 160);
    }
    const friendly =
      res.status === 402
        ? "The image API account is out of credits."
        : res.status === 401 || res.status === 403
          ? "The image API rejected the configured key."
          : `Image service error (HTTP ${res.status})${upstreamMsg ? `: ${upstreamMsg}` : ""}.`;
    console.error(`Image proxy upstream ${res.status}: ${detail.slice(0, 500)}`);
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
