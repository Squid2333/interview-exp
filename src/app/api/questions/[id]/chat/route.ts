import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError, answerFollowup, extractWeakPoint } from "@/lib/ai";
import { getQuestionDetail, now, transaction } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const question = await getQuestionDetail(id);
  if (!question) return NextResponse.json({ error: "题目不存在。" }, { status: 404 });
  const body = (await request.json().catch(() => null)) as { message?: unknown } | null;
  if (!body || typeof body.message !== "string" || !body.message.trim()) return NextResponse.json({ error: "请输入追问内容。" }, { status: 400 });
  const message = body.message.trim().slice(0, 3000);
  try {
    const response = await answerFollowup({
      question: question.title,
      category: question.category,
      answer: question.answer?.content || null,
      history: [...question.messages, { id: "new", role: "user", content: message, createdAt: now() }],
    });
    const timestamp = now();
    const userMessageId = crypto.randomUUID();
    await transaction(async (client) => {
      await client.query("INSERT INTO messages (id,question_id,role,content,created_at) VALUES ($1,$2,'user',$3,$4)", [userMessageId, id, message, timestamp]);
      await client.query("INSERT INTO messages (id,question_id,role,content,created_at) VALUES ($1,$2,'assistant',$3,$4)", [crypto.randomUUID(), id, response, timestamp]);
      await client.query("UPDATE questions SET status=CASE WHEN status='todo' THEN 'learning' ELSE status END, updated_at=$1 WHERE id=$2", [timestamp, id]);
    });
    const weakPoint = await extractWeakPoint(question.title, message);
    if (weakPoint) {
      await transaction(async (client) => {
        await client.query("SELECT id FROM questions WHERE id=$1 FOR UPDATE", [id]);
        const existing = await client.query("SELECT 1 FROM notes WHERE question_id=$1 AND content=$2 LIMIT 1", [id, weakPoint]);
        if (!existing.rowCount) await client.query("INSERT INTO notes (id,question_id,content,source_message_id,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6)", [crypto.randomUUID(), id, weakPoint, userMessageId, timestamp, timestamp]);
      });
    }
    return NextResponse.json({ question: await getQuestionDetail(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "回复失败，请重试。" }, { status: error instanceof AIConfigurationError ? 503 : 502 });
  }
}
