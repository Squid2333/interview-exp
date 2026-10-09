import assert from "node:assert/strict";
import test from "node:test";
import { getQuestionSummaries } from "../src/lib/db.ts";

test("legacy learning questions join pending without losing review dates", async () => {
  const previousPool = globalThis.interviewPool;
  const nextReviewAt = "2026-10-12T08:00:00.000Z";
  globalThis.interviewPool = {
    query: async () => ({ rows: ["todo", "learning", "mastered"].map((status) => ({
      id: status, title: "测试题目", category: "Java", tags: "[]", status,
      created_at: "2026-10-09T08:00:00.000Z", updated_at: "2026-10-09T08:00:00.000Z",
      next_review_at: nextReviewAt, note_count: "2", has_answer: true,
      is_favorite: status !== "todo",
    })) }),
  };
  try {
    const questions = await getQuestionSummaries();
    assert.deepEqual(questions.map((question) => question.status), ["todo", "todo", "mastered"]);
    assert.deepEqual(questions.map((question) => question.isFavorite), [false, true, true]);
    assert.equal(questions.filter((question) => question.status === "todo").length, 2);
    assert.ok(questions.every((question) => question.nextReviewAt === nextReviewAt && question.hasAnswer && question.noteCount === 2));
  } finally {
    globalThis.interviewPool = previousPool;
  }
});
