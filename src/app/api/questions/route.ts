import { NextRequest, NextResponse } from "next/server";
import { getDb, getQuestionSummary } from "@/lib/db";
import type { DashboardStats, QuestionSummary } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const rows = getDb().prepare(`
    SELECT q.*,
      (SELECT COUNT(*) FROM notes n WHERE n.question_id=q.id) AS note_count,
      EXISTS(SELECT 1 FROM answers a WHERE a.question_id=q.id) AS has_answer
    FROM questions q ORDER BY q.updated_at DESC, q.rowid DESC
  `).all() as Array<{ id: string }>;
  const all = rows.map((row) => getQuestionSummary(row.id)).filter((item): item is QuestionSummary => Boolean(item));
  const now = new Date().toISOString();
  const stats: DashboardStats = {
    total: all.length,
    todo: all.filter((q) => q.status === "todo").length,
    learning: all.filter((q) => q.status === "learning").length,
    mastered: all.filter((q) => q.status === "mastered").length,
    due: all.filter((q) => q.nextReviewAt && q.nextReviewAt <= now).length,
  };
  const search = request.nextUrl.searchParams.get("search")?.toLowerCase().trim() || "";
  const status = request.nextUrl.searchParams.get("status");
  const category = request.nextUrl.searchParams.get("category");
  const due = request.nextUrl.searchParams.get("due") === "true";
  const questions = all.filter((q) =>
    (!search || `${q.title} ${q.category} ${q.tags.join(" ")}`.toLowerCase().includes(search)) &&
    (!status || q.status === status) &&
    (!category || q.category === category) &&
    (!due || Boolean(q.nextReviewAt && q.nextReviewAt <= now)),
  );
  const categories = [...new Set(all.map((q) => q.category))].sort((a, b) => a.localeCompare(b, "zh-CN"));
  return NextResponse.json({ questions, stats, categories });
}
