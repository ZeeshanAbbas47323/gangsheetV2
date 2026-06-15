import { NextResponse } from "next/server";
import { runClipdropRoute } from "@/lib/server/imageProxy";

export const runtime = "nodejs";
export const maxDuration = 60;

// NEW CHANGE: ClipDrop Remove Text endpoint (from the official API collection).
export async function POST(req: Request): Promise<NextResponse> {
  let body: { image?: string; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const { status, json } = await runClipdropRoute("remove-text", body);
  return NextResponse.json(json, { status });
}
