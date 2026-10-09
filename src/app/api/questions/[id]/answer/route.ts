import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError, generateAnswer } from "@/lib/ai";
import { getDb, getQuestionDetail, now } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const question = getQuestionDetail(id);
  if (!question) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  try {
    const content = await generateAnswer(question.title, question.category);
    const timestamp = now();
    getDb().prepare("INSERT INTO answers (id,question_id,content,source,created_at) VALUES (?,?,?,'ai',?)").run(crypto.randomUUID(), id, content, timestamp);
    getDb().prepare("UPDATE questions SET status='learning', updated_at=? WHERE id=? AND status='todo'").run(timestamp, id);
    return NextResponse.json({ question: getQuestionDetail(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成失败，请重试。" }, { status: error instanceof AIConfigurationError ? 503 : 502 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!getQuestionDetail(id)) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (!body || typeof body.content !== "string" || !body.content.trim()) return NextResponse.json({ error: "答案不能为空。" }, { status: 400 });
  const timestamp = now();
  getDb().prepare("INSERT INTO answers (id,question_id,content,source,created_at) VALUES (?,?,?,'manual',?)").run(crypto.randomUUID(), id, body.content.trim(), timestamp);
  getDb().prepare("UPDATE questions SET updated_at=? WHERE id=?").run(timestamp, id);
  getDb().prepare("UPDATE questions SET status='learning' WHERE id=? AND status='todo'").run(id);
  return NextResponse.json({ question: getQuestionDetail(id) });
}
