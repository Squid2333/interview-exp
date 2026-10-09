import { NextRequest, NextResponse } from "next/server";
import { getDb, getQuestionDetail, now } from "@/lib/db";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  if (!await getQuestionDetail(id)) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { result?: unknown } | null;
  if (!body || !["again", "good"].includes(String(body.result))) return NextResponse.json({ error: "复习结果无效。" }, { status: 400 });
  const db = getDb();
  const { rows } = await db.query<{ review_interval_days: number }>("SELECT review_interval_days FROM questions WHERE id=$1", [id]);
  const row = rows[0];
  if (!row) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const interval = body.result === "again" ? 1 : row.review_interval_days === 0 ? 3 : Math.min(row.review_interval_days * 2, 60);
  const next = new Date(Date.now() + interval * 24 * 60 * 60 * 1000).toISOString();
  const timestamp = now();
  await db.query("UPDATE questions SET status=$1,review_interval_days=$2,last_reviewed_at=$3,next_review_at=$4,updated_at=$5 WHERE id=$6",
    [body.result === "good" ? "mastered" : "learning", interval, timestamp, next, timestamp, id]);
  return NextResponse.json({ question: await getQuestionDetail(id) });
}
