import { NextRequest, NextResponse } from "next/server";
import { classifyQuestions } from "@/lib/ai";
import { getDb, now } from "@/lib/db";
import { normalizeQuestion, splitQuestions } from "@/lib/questions";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") return NextResponse.json({ error: "请粘贴题目文本。" }, { status: 400 });
  if (body.text.length > 50000) return NextResponse.json({ error: "一次导入的文本最多 5 万字，请分批导入。" }, { status: 400 });
  const lines = splitQuestions(body.text);
  if (!lines.length) return NextResponse.json({ error: "没有识别到题目，请每行输入一道题。" }, { status: 400 });
  if (lines.length > 150) return NextResponse.json({ error: "单次最多导入 150 道题，请分批导入。" }, { status: 400 });
  if (lines.some((line) => line.length > 500)) return NextResponse.json({ error: "单道题最多 500 字，请精简后再导入。" }, { status: 400 });

  const db = getDb();
  const existing = new Set((db.prepare("SELECT normalized_title FROM questions").all() as Array<{ normalized_title: string }>).map((q) => q.normalized_title));
  const unique: Array<{ title: string; normalized: string }> = [];
  let duplicates = 0;
  for (const title of lines) {
    const normalized = normalizeQuestion(title);
    if (!normalized || existing.has(normalized)) { duplicates += 1; continue; }
    existing.add(normalized);
    unique.push({ title, normalized });
  }
  if (!unique.length) return NextResponse.json({ imported: 0, duplicates, usedAI: false, warning: "这些题目都已存在。" });

  const classification = await classifyQuestions(unique.map((q) => q.title));
  const timestamp = now();
  const insert = db.prepare("INSERT INTO questions (id,title,normalized_title,category,tags,status,created_at,updated_at) VALUES (?,?,?,?,?,'todo',?,?)");
  db.exec("BEGIN");
  try {
    unique.forEach((q, index) => {
      const result = classification.items[index];
      insert.run(crypto.randomUUID(), q.title, q.normalized, result.category, JSON.stringify(result.tags), timestamp, timestamp);
    });
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return NextResponse.json({ imported: unique.length, duplicates, usedAI: classification.usedAI, warning: classification.warning });
}
