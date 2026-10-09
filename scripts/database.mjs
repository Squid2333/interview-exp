import nextEnv from "@next/env";
import pg from "pg";
import { readFile } from "node:fs/promises";
import { databaseOptions } from "../src/lib/database-options.mjs";

nextEnv.loadEnvConfig(process.cwd());

const action = process.argv[2];
if (!["check", "setup"].includes(action)) {
  console.error("用法：npm run db:check 或 npm run db:setup");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("请先在 .env.local 或 .env 中设置 DATABASE_URL。");
  process.exit(1);
}

const pool = new pg.Pool({ ...databaseOptions(), max: 1 });

try {
  if (action === "setup") {
    const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
    await pool.query(schema);
    console.log("建表完成，已有题目和备注已保留。");
  } else {
    await pool.query("SELECT 1");
    const { rows } = await pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name IN ('questions','answers','messages','notes','ai_usage')
    `);
    const expected = {
      questions: ["id", "title", "normalized_title", "category", "tags", "status", "review_interval_days", "last_reviewed_at", "next_review_at", "created_at", "updated_at", "sequence_id"],
      answers: ["id", "question_id", "content", "source", "created_at", "sequence_id"],
      messages: ["id", "question_id", "role", "content", "created_at", "sequence_id"],
      notes: ["id", "question_id", "content", "source_message_id", "created_at", "updated_at", "sequence_id"],
      ai_usage: ["id", "usage_date", "model_role", "created_at"],
    };
    const missing = Object.entries(expected).flatMap(([table, columns]) => columns
      .filter((column) => !rows.some((row) => row.table_name === table && row.column_name === column))
      .map((column) => `${table}.${column}`));
    if (missing.length) {
      console.error(`连接成功，但缺少字段：${missing.join(", ")}。请执行 npm run db:setup。`);
      process.exitCode = 1;
    } else {
      console.log("数据库连接成功，5 张表及所需字段均已就绪。");
    }
  }
} catch (error) {
  // Avoid printing credentials or the connection string in diagnostics.
  const code = typeof error.code === "string" ? error.code : "UNKNOWN";
  const hint = ["SELF_SIGNED_CERT_IN_CHAIN", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"].includes(code)
    ? "请从 Supabase Database Settings 下载 CA certificate，并将证书全文配置为 DATABASE_SSL_CA。"
    : "请检查连接串、数据库密码、网络及 Supabase 项目状态。";
  console.error(`数据库操作失败（${code}）。${hint}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
