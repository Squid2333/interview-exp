import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { getDb, getQuestionDetail, now } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  if (!await getQuestionDetail(id)) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (!body || typeof body.content !== "string" || !body.content.trim()) return NextResponse.json({ error: "备注不能为空。" }, { status: 400 });
  const timestamp = now();
  await getDb().query("INSERT INTO notes (id,question_id,content,source_message_id,created_at,updated_at) VALUES ($1,$2,$3,NULL,$4,$5)",
    [crypto.randomUUID(), id, body.content.trim().slice(0, 500), timestamp, timestamp]);
  return NextResponse.json({ question: await getQuestionDetail(id) });
}
