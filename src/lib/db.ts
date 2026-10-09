import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
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
  note_count: number;
  has_answer: number;
};

const globalDb = globalThis as unknown as { interviewDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (globalDb.interviewDb) return globalDb.interviewDb;
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), "data");
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, "interview.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL DEFAULT '其他',
      tags TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','learning','mastered')),
      review_interval_days INTEGER NOT NULL DEFAULT 0,
      last_reviewed_at TEXT,
      next_review_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS answers (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      source TEXT NOT NULL CHECK(source IN ('ai','manual')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS answers_question_idx ON answers(question_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('user','assistant')),
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_question_idx ON messages(question_id, created_at);
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_question_idx ON notes(question_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS ai_usage (
      id TEXT PRIMARY KEY,
      usage_date TEXT NOT NULL,
      model_role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ai_usage_date_idx ON ai_usage(usage_date);
  `);
  globalDb.interviewDb = db;
  return db;
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
    noteCount: row.note_count,
    hasAnswer: Boolean(row.has_answer),
  };
}

const SUMMARY_SQL = `
  SELECT q.*,
    (SELECT COUNT(*) FROM notes n WHERE n.question_id=q.id) AS note_count,
    EXISTS(SELECT 1 FROM answers a WHERE a.question_id=q.id) AS has_answer
  FROM questions q
`;

export function getQuestionSummary(id: string): QuestionSummary | null {
  const row = getDb().prepare(`${SUMMARY_SQL} WHERE q.id=?`).get(id) as RawQuestion | undefined;
  return row ? mapSummary(row) : null;
}

export function getQuestionDetail(id: string): QuestionDetail | null {
  const summary = getQuestionSummary(id);
  if (!summary) return null;
  const db = getDb();
  const rawAnswer = db.prepare("SELECT id,content,source,created_at FROM answers WHERE question_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1").get(id) as { id: string; content: string; source: Answer["source"]; created_at: string } | undefined;
  const rawMessages = db.prepare("SELECT id,role,content,created_at FROM messages WHERE question_id=? ORDER BY created_at ASC, rowid ASC").all(id) as Array<{ id: string; role: ChatMessage["role"]; content: string; created_at: string }>;
  const rawNotes = db.prepare("SELECT id,content,source_message_id,created_at FROM notes WHERE question_id=? ORDER BY created_at DESC, rowid DESC").all(id) as Array<{ id: string; content: string; source_message_id: string | null; created_at: string }>;
  return {
    ...summary,
    answer: rawAnswer ? { id: rawAnswer.id, content: rawAnswer.content, source: rawAnswer.source, createdAt: rawAnswer.created_at } : null,
    messages: rawMessages.map((m) => ({ id: m.id, role: m.role, content: m.content, createdAt: m.created_at })),
    notes: rawNotes.map((n) => ({ id: n.id, content: n.content, sourceMessageId: n.source_message_id, createdAt: n.created_at })),
  };
}

export function now(): string {
  return new Date().toISOString();
}
