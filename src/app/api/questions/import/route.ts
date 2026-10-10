import { NextRequest, NextResponse } from "next/server";
import { requireOwnerApi } from "@/lib/auth";
import { classifyQuestions } from "@/lib/ai";
import { getCategoryNames, OTHER_CATEGORY } from "@/lib/categories";
import { getDb, now, transaction } from "@/lib/db";
import { normalizeQuestion, splitQuestions } from "@/lib/questions";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const denied = await requireOwnerApi();
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { text?: unknown } | null;
  if (!body || typeof body.text !== "string") return NextResponse.json({ error: "请粘贴题目文本。" }, { status: 400 });
  if (body.text.length > 50000) return NextResponse.json({ error: "一次导入的文本最多 5 万字，请分批导入。" }, { status: 400 });
  const lines = splitQuestions(body.text);
  if (!lines.length) return NextResponse.json({ error: "没有识别到题目，请每行输入一道题。" }, { status: 400 });
  if (lines.length > 150) return NextResponse.json({ error: "单次最多导入 150 道题，请分批导入。" }, { status: 400 });
  if (lines.some((line) => line.length > 500)) return NextResponse.json({ error: "单道题最多 500 字，请精简后再导入。" }, { status: 400 });

  const db = getDb();
  const { rows } = await db.query<{ normalized_title: string }>("SELECT normalized_title FROM questions");
  const existing = new Set(rows.map((q) => q.normalized_title));
  const unique: Array<{ title: string; normalized: string }> = [];
  let duplicates = 0;
  for (const title of lines) {
    const normalized = normalizeQuestion(title);
    if (!normalized || existing.has(normalized)) { duplicates += 1; continue; }
    existing.add(normalized);
    unique.push({ title, normalized });
  }
  if (!unique.length) return NextResponse.json({ imported: 0, duplicates, usedAI: false, warning: "这些题目都已存在。" });

  const classification = await classifyQuestions(unique.map((q) => q.title), await getCategoryNames());
  const timestamp = now();
  const imported = await transaction(async (client) => {
    const { rows: currentCategories } = await client.query<{ name: string }>("SELECT name FROM categories");
    const validCategories = new Set(currentCategories.map((item) => item.name));
    let count = 0;
    for (const [index, q] of unique.entries()) {
      const result = classification.items[index];
      const inserted = await client.query(
        "INSERT INTO questions (id,title,normalized_title,category,tags,status,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,'todo',$6,$7) ON CONFLICT (normalized_title) DO NOTHING",
        [crypto.randomUUID(), q.title, q.normalized, validCategories.has(result.category) ? result.category : OTHER_CATEGORY, JSON.stringify(result.tags), timestamp, timestamp]);
      count += inserted.rowCount ?? 0;
    }
    return count;
  });
  duplicates += unique.length - imported;
  return NextResponse.json({ imported, duplicates, usedAI: classification.usedAI, warning: classification.warning });
}
