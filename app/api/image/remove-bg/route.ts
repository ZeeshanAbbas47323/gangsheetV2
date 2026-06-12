import { NextResponse } from "next/server";
import { ImageProxyError, proxyImageApi } from "@/lib/server/imageProxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  const apiUrl = process.env.REMOVE_BG_API_URL;
  const apiKey = process.env.REMOVE_BG_API_KEY;
  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      {
        error:
          "Background removal is not configured. Set REMOVE_BG_API_URL and REMOVE_BG_API_KEY in .env.local.",
      },
      { status: 503 }
    );
  }

  let body: { image?: string; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body.image) {
    return NextResponse.json({ error: "Missing image data." }, { status: 400 });
  }

  try {
    const image = await proxyImageApi({
      image: body.image,
      fileName: body.fileName ?? "image.png",
      apiUrl,
      apiKey,
      extraFields: { size: "auto" },
    });
    return NextResponse.json({ image });
  } catch (err) {
    if (err instanceof ImageProxyError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("remove-bg route error:", err);
    return NextResponse.json(
      { error: "Background removal failed unexpectedly." },
      { status: 500 }
    );
  }
}
