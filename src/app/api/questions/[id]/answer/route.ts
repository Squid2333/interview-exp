import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { AIConfigurationError, generateAnswer } from "@/lib/ai";
import { getQuestionDetail, now, transaction } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };

export async function POST(_request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  const question = await getQuestionDetail(id);
  if (!question) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  try {
    const content = await generateAnswer(question.title, question.category);
    const timestamp = now();
    await transaction(async (client) => {
      await client.query("INSERT INTO answers (id,question_id,content,source,created_at) VALUES ($1,$2,$3,'ai',$4)", [crypto.randomUUID(), id, content, timestamp]);
      await client.query("UPDATE questions SET updated_at=$1 WHERE id=$2", [timestamp, id]);
    });
    return NextResponse.json({ question: await getQuestionDetail(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "生成失败，请重试。" }, { status: error instanceof AIConfigurationError ? 503 : 502 });
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  if (!await getQuestionDetail(id)) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (!body || typeof body.content !== "string" || !body.content.trim()) return NextResponse.json({ error: "答案不能为空。" }, { status: 400 });
  const content = body.content.trim();
  const timestamp = now();
  await transaction(async (client) => {
    await client.query("INSERT INTO answers (id,question_id,content,source,created_at) VALUES ($1,$2,$3,'manual',$4)", [crypto.randomUUID(), id, content, timestamp]);
    await client.query("UPDATE questions SET updated_at=$1 WHERE id=$2", [timestamp, id]);
  });
  return NextResponse.json({ question: await getQuestionDetail(id) });
}
