import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { getCategoryNames } from "@/lib/categories";
import { getQuestionSummaries } from "@/lib/db";
import type { DashboardStats } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const [all, categories] = await Promise.all([getQuestionSummaries(), getCategoryNames()]);
  const now = new Date().toISOString();
  const stats: DashboardStats = {
    total: all.length,
    todo: all.filter((q) => q.status === "todo").length,
    mastered: all.filter((q) => q.status === "mastered").length,
    due: all.filter((q) => q.nextReviewAt && q.nextReviewAt <= now).length,
    favorites: all.filter((q) => q.isFavorite).length,
  };
  const search = request.nextUrl.searchParams.get("search")?.toLowerCase().trim() || "";
  const status = request.nextUrl.searchParams.get("status");
  const category = request.nextUrl.searchParams.get("category");
  const due = request.nextUrl.searchParams.get("due") === "true";
  const favorites = request.nextUrl.searchParams.get("favorites") === "true";
  const questions = all.filter((q) =>
    (!search || `${q.title} ${q.category} ${q.tags.join(" ")}`.toLowerCase().includes(search)) &&
    (!status || q.status === status) &&
    (!category || q.category === category) &&
    (!favorites || q.isFavorite) &&
    (!due || Boolean(q.nextReviewAt && q.nextReviewAt <= now)),
  );
  return NextResponse.json({ questions, stats, categories });
}
