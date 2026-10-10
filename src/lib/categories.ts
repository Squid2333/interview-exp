import { getDb } from "./db";
import type { CategoryInfo } from "./types";

export const OTHER_CATEGORY = "其他";

export function validCategoryName(value: unknown): value is string {
  return typeof value === "string" && value.length <= 30 && value === value.trim()
    && value.length > 0 && !/[\u0000-\u001f\u007f]/.test(value);
}

export async function getCategories(): Promise<CategoryInfo[]> {
  const { rows } = await getDb().query<{ name: string; question_count: string }>(`
    SELECT c.name, COUNT(q.id)::text AS question_count
    FROM categories c LEFT JOIN questions q ON q.category = c.name
    GROUP BY c.name, c.sequence_id
    ORDER BY (c.name = '其他'), c.sequence_id
  `);
  return rows.map((row) => ({ name: row.name, questionCount: Number(row.question_count) }));
}

export async function getCategoryNames(): Promise<string[]> {
  const { rows } = await getDb().query<{ name: string }>(
    "SELECT name FROM categories ORDER BY (name = '其他'), sequence_id",
  );
  return rows.map((row) => row.name);
}
