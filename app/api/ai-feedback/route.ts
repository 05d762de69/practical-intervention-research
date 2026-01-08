import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));

  let rawText = "";
  try {
    rawText = await req.text();
  } catch (e) {
    rawText = "[could not read body]";
  }

  return NextResponse.json({
    ok: true,
    headers,
    rawBody: rawText,
  });
}
