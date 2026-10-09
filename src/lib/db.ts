import { Pool, type PoolClient } from "pg";
import { databaseOptions } from "./database-options.mjs";
import type { Answer, ChatMessage, QuestionDetail, QuestionSummary } from "./types";

type RawQuestion = {
  id: string;
  title: string;
  category: string;
  tags: string;
  status: "todo" | "learning" | "mastered";
  created_at: string;
  updated_at: string;
  next_review_at: string | null;
  note_count: string;
  has_answer: boolean;
};

const globalDb = globalThis as unknown as { interviewPool?: Pool };

export function getDb(): Pool {
  if (globalDb.interviewPool) return globalDb.interviewPool;
  const pool = new Pool(databaseOptions());
  pool.on("error", () => console.error("数据库空闲连接已断开，将在下次请求时重新连接。"));
  globalDb.interviewPool = pool;
  return pool;
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function mapSummary(row: RawQuestion): QuestionSummary {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    tags: JSON.parse(row.tags),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextReviewAt: row.next_review_at,
    noteCount: Number(row.note_count),
    hasAnswer: Boolean(row.has_answer),
  };
}

const SUMMARY_SQL = `
  SELECT q.*,
    (SELECT COUNT(*) FROM notes n WHERE n.question_id=q.id) AS note_count,
    EXISTS(SELECT 1 FROM answers a WHERE a.question_id=q.id) AS has_answer
  FROM questions q
`;

export async function getQuestionSummaries(): Promise<QuestionSummary[]> {
  const { rows } = await getDb().query<RawQuestion>(`${SUMMARY_SQL} ORDER BY q.updated_at DESC, q.sequence_id DESC`);
  return rows.map(mapSummary);
}

export async function getQuestionSummary(id: string): Promise<QuestionSummary | null> {
  const { rows } = await getDb().query<RawQuestion>(`${SUMMARY_SQL} WHERE q.id=$1`, [id]);
  return rows[0] ? mapSummary(rows[0]) : null;
}

export async function getQuestionDetail(id: string): Promise<QuestionDetail | null> {
  const summary = await getQuestionSummary(id);
  if (!summary) return null;
  const db = getDb();
  const [answerResult, messagesResult, notesResult] = await Promise.all([
    db.query<{ id: string; content: string; source: Answer["source"]; created_at: string }>(
      "SELECT id,content,source,created_at FROM answers WHERE question_id=$1 ORDER BY created_at DESC, sequence_id DESC LIMIT 1", [id]),
    db.query<{ id: string; role: ChatMessage["role"]; content: string; created_at: string }>(
      "SELECT id,role,content,created_at FROM messages WHERE question_id=$1 ORDER BY created_at ASC, sequence_id ASC", [id]),
    db.query<{ id: string; content: string; source_message_id: string | null; created_at: string }>(
      "SELECT id,content,source_message_id,created_at FROM notes WHERE question_id=$1 ORDER BY created_at DESC, sequence_id DESC", [id]),
  ]);
  const rawAnswer = answerResult.rows[0];
  return {
    ...summary,
    answer: rawAnswer ? { id: rawAnswer.id, content: rawAnswer.content, source: rawAnswer.source, createdAt: rawAnswer.created_at } : null,
    messages: messagesResult.rows.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
    notes: notesResult.rows.map((n) => ({ id: n.id, content: n.content, sourceMessageId: n.source_message_id, createdAt: n.created_at })),
  };
}

export function now(): string {
  return new Date().toISOString();
}
