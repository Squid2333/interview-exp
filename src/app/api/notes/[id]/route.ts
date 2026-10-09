import { NextRequest, NextResponse } from "next/server";
import { getDb, getQuestionDetail, now } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (!body || typeof body.content !== "string" || !body.content.trim()) return NextResponse.json({ error: "备注不能为空。" }, { status: 400 });
  const db = getDb();
  const note = db.prepare("SELECT question_id FROM notes WHERE id=?").get(id) as { question_id: string } | undefined;
  if (!note) return NextResponse.json({ error: "备注不存在。" }, { status: 404 });
  db.prepare("UPDATE notes SET content=?,updated_at=? WHERE id=?").run(body.content.trim().slice(0, 500), now(), id);
  return NextResponse.json({ question: getQuestionDetail(note.question_id) });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const db = getDb();
  const note = db.prepare("SELECT question_id FROM notes WHERE id=?").get(id) as { question_id: string } | undefined;
  if (!note) return NextResponse.json({ error: "备注不存在。" }, { status: 404 });
  db.prepare("DELETE FROM notes WHERE id=?").run(id);
  return NextResponse.json({ question: getQuestionDetail(note.question_id) });
}
