import { readFileSync } from "node:fs";
import path from "node:path";

export function databaseOptions(env = process.env) {
  if (!env.DATABASE_URL) {
    throw new Error("数据库尚未配置，请设置 DATABASE_URL 并执行 Supabase 建表脚本。");
  }
  const url = new URL(env.DATABASE_URL);
  // pg connection-string SSL parameters can override the supplied CA certificate.
  for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    url.searchParams.delete(key);
  }
  const ca = env.DATABASE_SSL_CA?.replace(/\\n/g, "\n")
    || readFileSync(path.join(process.cwd(), "prod-ca-2021.crt"), "utf8");
  return {
    connectionString: url.toString(),
    ssl: {
      rejectUnauthorized: true,
      ca,
    },
    max: 3,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
    allowExitOnIdle: true,
  };
}
