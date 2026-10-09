import { NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { aiConfigured, aiUsageToday } from "@/lib/ai";

export const runtime = "nodejs";

export async function GET() {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  return NextResponse.json({ aiConfigured: aiConfigured(), usage: await aiUsageToday() });
}
