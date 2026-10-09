import { NextResponse } from "next/server";
import { aiConfigured, aiUsageToday } from "@/lib/ai";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ aiConfigured: aiConfigured(), usage: aiUsageToday() });
}
