import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { getDb, getQuestionDetail, now } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  if (!body || typeof body.content !== "string" || !body.content.trim()) return NextResponse.json({ error: "备注不能为空。" }, { status: 400 });
  const db = getDb();
  const { rows } = await db.query<{ question_id: string }>("SELECT question_id FROM notes WHERE id=$1", [id]);
  const note = rows[0];
  if (!note) return NextResponse.json({ error: "备注不存在。" }, { status: 404 });
  await db.query("UPDATE notes SET content=$1,updated_at=$2 WHERE id=$3", [body.content.trim().slice(0, 500), now(), id]);
  return NextResponse.json({ question: await getQuestionDetail(note.question_id) });
}

export async function DELETE(_request: NextRequest, context: Context) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const { id } = await context.params;
  const db = getDb();
  const { rows } = await db.query<{ question_id: string }>("SELECT question_id FROM notes WHERE id=$1", [id]);
  const note = rows[0];
  if (!note) return NextResponse.json({ error: "备注不存在。" }, { status: 404 });
  await db.query("DELETE FROM notes WHERE id=$1", [id]);
  return NextResponse.json({ question: await getQuestionDetail(note.question_id) });
}
