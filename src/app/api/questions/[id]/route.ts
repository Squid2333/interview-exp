import { NextRequest, NextResponse } from "next/server";
import { getDb, getQuestionDetail, now } from "@/lib/db";
import { CATEGORIES, normalizeQuestion } from "@/lib/questions";
import type { QuestionStatus } from "@/lib/types";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const question = getQuestionDetail(id);
  return question ? NextResponse.json({ question }) : NextResponse.json({ error: "题目不存在。" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!getQuestionDetail(id)) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  const fields: string[] = [];
  const values: Array<string> = [];
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length < 3) return NextResponse.json({ error: "题目至少需要 3 个字。" }, { status: 400 });
    fields.push("title=?", "normalized_title=?");
    values.push(body.title.trim(), normalizeQuestion(body.title));
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !CATEGORIES.includes(body.category as typeof CATEGORIES[number])) return NextResponse.json({ error: "分类无效。" }, { status: 400 });
    fields.push("category=?"); values.push(body.category);
  }
  if (body.status !== undefined) {
    if (!["todo", "learning", "mastered"].includes(String(body.status))) return NextResponse.json({ error: "状态无效。" }, { status: 400 });
    fields.push("status=?"); values.push(body.status as QuestionStatus);
    if (body.status === "todo") {
      fields.push("review_interval_days=0", "last_reviewed_at=NULL", "next_review_at=NULL");
    } else {
      const days = body.status === "mastered" ? 3 : 1;
      fields.push(`review_interval_days=${days}`, "last_reviewed_at=?", "next_review_at=?");
      values.push(now(), new Date(Date.now() + days * 86400000).toISOString());
    }
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== "string")) return NextResponse.json({ error: "标签格式无效。" }, { status: 400 });
    fields.push("tags=?"); values.push(JSON.stringify((body.tags as string[]).map((tag) => tag.trim()).filter(Boolean).slice(0, 8)));
  }
  if (!fields.length) return NextResponse.json({ error: "没有可更新的内容。" }, { status: 400 });
  fields.push("updated_at=?"); values.push(now());
  try {
    getDb().prepare(`UPDATE questions SET ${fields.join(",")} WHERE id=?`).run(...values, id);
  } catch {
    return NextResponse.json({ error: "题目已存在，无法保存重复题目。" }, { status: 409 });
  }
  return NextResponse.json({ question: getQuestionDetail(id) });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  getDb().prepare("DELETE FROM questions WHERE id=?").run(id);
  return NextResponse.json({ ok: true });
}
