import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { getCategoryNames } from "@/lib/categories";
import { getDb, getQuestionDetail, now } from "@/lib/db";
import { normalizeQuestion } from "@/lib/questions";
import type { QuestionStatus } from "@/lib/types";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  const question = await getQuestionDetail(id);
  return question ? NextResponse.json({ question }) : NextResponse.json({ error: "题目不存在。" }, { status: 404 });
}

export async function PATCH(request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  if (!await getQuestionDetail(id)) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "请求格式不正确。" }, { status: 400 });
  const fields: string[] = [];
  const values: Array<string | boolean> = [];
  function setField(column: string, value: string | boolean) {
    values.push(value);
    fields.push(`${column}=$${values.length}`);
  }
  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length < 3) return NextResponse.json({ error: "题目至少需要 3 个字。" }, { status: 400 });
    setField("title", body.title.trim());
    setField("normalized_title", normalizeQuestion(body.title));
  }
  if (body.category !== undefined) {
    if (typeof body.category !== "string" || !(await getCategoryNames()).includes(body.category)) return NextResponse.json({ error: "分类无效。" }, { status: 400 });
    setField("category", body.category);
  }
  if (body.status !== undefined) {
    if (!["todo", "mastered"].includes(String(body.status))) return NextResponse.json({ error: "状态无效。" }, { status: 400 });
    setField("status", body.status as QuestionStatus);
    if (body.status === "todo") {
      fields.push("review_interval_days=0", "last_reviewed_at=NULL", "next_review_at=NULL");
    } else {
      const days = 3;
      fields.push(`review_interval_days=${days}`);
      setField("last_reviewed_at", now());
      setField("next_review_at", new Date(Date.now() + days * 86400000).toISOString());
    }
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || body.tags.some((tag) => typeof tag !== "string")) return NextResponse.json({ error: "标签格式无效。" }, { status: 400 });
    setField("tags", JSON.stringify((body.tags as string[]).map((tag) => tag.trim()).filter(Boolean).slice(0, 8)));
  }
  if (body.isFavorite !== undefined) {
    if (typeof body.isFavorite !== "boolean") return NextResponse.json({ error: "收藏状态无效。" }, { status: 400 });
    setField("is_favorite", body.isFavorite);
  }
  if (!fields.length) return NextResponse.json({ error: "没有可更新的内容。" }, { status: 400 });
  if (fields.length > 1 || body.isFavorite === undefined) setField("updated_at", now());
  try {
    await getDb().query(`UPDATE questions SET ${fields.join(",")} WHERE id=$${values.length + 1}`, [...values, id]);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return NextResponse.json({ error: "题目已存在，无法保存重复题目。" }, { status: 409 });
    }
    if (error && typeof error === "object" && "code" in error && error.code === "23503") {
      return NextResponse.json({ error: "分类已被删除，请刷新后重试。" }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ question: await getQuestionDetail(id) });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  await getDb().query("DELETE FROM questions WHERE id=$1", [id]);
  return NextResponse.json({ ok: true });
}
