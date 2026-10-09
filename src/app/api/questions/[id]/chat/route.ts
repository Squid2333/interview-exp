import { NextRequest, NextResponse } from "next/server";
import { AIConfigurationError, answerFollowup, extractWeakPoint } from "@/lib/ai";
import { getDb, getQuestionDetail, now } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const { id } = await context.params;
  const question = getQuestionDetail(id);
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
    const db = getDb();
    const timestamp = now();
    const userMessageId = crypto.randomUUID();
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO messages (id,question_id,role,content,created_at) VALUES (?,?,'user',?,?)").run(userMessageId, id, message, timestamp);
      db.prepare("INSERT INTO messages (id,question_id,role,content,created_at) VALUES (?,?,'assistant',?,?)").run(crypto.randomUUID(), id, response, timestamp);
      db.prepare("UPDATE questions SET status='learning', updated_at=? WHERE id=? AND status='todo'").run(timestamp, id);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const weakPoint = await extractWeakPoint(question.title, message);
    if (weakPoint) {
      const existing = db.prepare("SELECT 1 FROM notes WHERE question_id=? AND content=? LIMIT 1").get(id, weakPoint);
      if (!existing) db.prepare("INSERT INTO notes (id,question_id,content,source_message_id,created_at,updated_at) VALUES (?,?,?,?,?,?)").run(crypto.randomUUID(), id, weakPoint, userMessageId, timestamp, timestamp);
    }
    return NextResponse.json({ question: getQuestionDetail(id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "回复失败，请重试。" }, { status: error instanceof AIConfigurationError ? 503 : 502 });
  }
}
