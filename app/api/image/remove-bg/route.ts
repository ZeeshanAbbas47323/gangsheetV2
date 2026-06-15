import { NextResponse } from "next/server";
import { runClipdropRoute } from "@/lib/server/imageProxy";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<NextResponse> {
  let body: { image?: string; fileName?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  console.log(body);
  
  const { status, json } = await runClipdropRoute("remove-bg", body);
  return NextResponse.json(json, { status });
}
