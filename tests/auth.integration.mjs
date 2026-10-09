import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServerClient } from "@supabase/ssr";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = "http://localhost:3117";
const authBase = "http://127.0.0.1:3118";
const ownerEmail = "owner@example.test";
const users = {
  owner: { id: "11111111-1111-4111-8111-111111111111", email: ownerEmail, email_confirmed_at: "2026-01-01T00:00:00Z", aud: "authenticated", role: "authenticated" },
  other: { id: "22222222-2222-4222-8222-222222222222", email: "other@example.test", email_confirmed_at: "2026-01-01T00:00:00Z", aud: "authenticated", role: "authenticated" },
};
const tokens = new Map();
const refreshTokens = new Map();
let refreshCount = 0;
function issue(user, expired = false) {
  const exp = Math.floor(Date.now() / 1000) + (expired ? -60 : 3600);
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, email: user.email, exp, aud: "authenticated" })}.${crypto.randomUUID()}`;
  const refresh_token = crypto.randomUUID();
  tokens.set(access_token, { user, expired });
  refreshTokens.set(refresh_token, user);
  return { access_token, refresh_token, token_type: "bearer", expires_in: expired ? -60 : 3600, expires_at: exp, user };
}
const mock = createServer(async (req, res) => {
  res.setHeader("Content-Type", "application/json");
  let body = "";
  for await (const chunk of req) body += chunk;
  const data = body ? JSON.parse(body) : {};
  if (req.url.startsWith("/auth/v1/token?grant_type=password")) {
    if (data.email === ownerEmail && data.password === "test-password") return res.end(JSON.stringify(issue(users.owner)));
  } else if (req.url.startsWith("/auth/v1/token?grant_type=refresh_token")) {
    const user = refreshTokens.get(data.refresh_token);
    if (user) { refreshCount++; return res.end(JSON.stringify(issue(user))); }
  } else if (req.url === "/auth/v1/user") {
    const token = tokens.get(req.headers.authorization?.replace("Bearer ", ""));
    if (token && !token.expired) return res.end(JSON.stringify(token.user));
  } else if (req.url.startsWith("/auth/v1/logout")) {
    const session = tokens.get(req.headers.authorization?.replace("Bearer ", ""));
    for (const [token, user] of refreshTokens) {
      if (user.id === session?.user.id) refreshTokens.delete(token);
    }
    res.statusCode = 204;
    return res.end();
  }
  res.statusCode = 401;
  res.end(JSON.stringify({ msg: "Invalid credentials", code: "invalid_credentials" }));
});
mock.listen(3118, "127.0.0.1");
await once(mock, "listening");
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3117"], {
  env: { ...process.env, SUPABASE_URL: authBase, SUPABASE_PUBLISHABLE_KEY: "test-publishable-key", APP_OWNER_EMAIL: ownerEmail, AI_API_KEY: "" },
  stdio: "ignore",
});
const stopped = once(server, "exit");
let browser;

async function fixtureCookie(session) {
  let values = [];
  const client = createServerClient(authBase, "test-publishable-key", {
    cookies: { getAll: () => [], setAll: (cookies) => { values = cookies; } },
  });
  await client.auth.setSession(session);
  return values.map(({ name, value }) => `${name}=${value}`).join("; ");
}

try {
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { const response = await fetch(`${base}/login`); if (response.ok) { ready = true; break; } } catch {}
    await delay(200);
  }
  assert.ok(ready, "verification server ready");
  const home = await fetch(base, { redirect: "manual" });
  assert.equal(home.status, 307);
  assert.equal(home.headers.get("location"), "/login");
  const routes = [
    ["/api/config", "GET"], ["/api/questions", "GET"], ["/api/questions/import", "POST"],
    ["/api/questions/test", "GET"], ["/api/questions/test", "PATCH"], ["/api/questions/test", "DELETE"],
    ["/api/questions/test/answer", "POST"], ["/api/questions/test/answer", "PATCH"],
    ["/api/questions/test/chat", "POST"], ["/api/questions/test/notes", "POST"],
    ["/api/questions/test/review", "POST"], ["/api/notes/test", "PATCH"], ["/api/notes/test", "DELETE"],
  ];
  for (const [path, method] of routes) {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, 401, `${method} ${path} rejects anonymous access`);
    assert.match(response.headers.get("cache-control"), /no-store/);
  }
  const otherCookie = await fixtureCookie(issue(users.other));
  for (const [path, method] of routes) {
    const response = await fetch(base + path, { method, headers: { Cookie: otherCookie } });
    assert.equal(response.status, 403, `${method} ${path} rejects another account`);
  }
  const forgedSession = issue(users.owner);
  tokens.delete(forgedSession.access_token);
  const forgedCookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(forgedSession)).toString("base64url")}`;
  assert.equal((await fetch(`${base}/api/questions`, { headers: { Cookie: forgedCookie } })).status, 401);
  assert.equal((await fetch(`${base}/api/questions`, { headers: { Origin: "https://other.example.test" } })).status, 403);
  assert.equal((await fetch(`${base}/api/questions`, { headers: { Origin: "null" } })).status, 403);

  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(`${base}/login`);
  await page.getByLabel("邮箱", { exact: true }).fill(ownerEmail);
  await page.getByLabel("密码", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "邮箱或密码不正确" }).waitFor();
  assert.equal(await page.getByLabel("邮箱", { exact: true }).inputValue(), ownerEmail, "email retained after login failure");
  await page.getByLabel("密码", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "显示密码", exact: true }).click();
  assert.equal(await page.getByLabel("密码", { exact: true }).getAttribute("type"), "text");
  await page.getByRole("button", { name: "隐藏密码", exact: true }).click();
  await page.getByRole("button", { name: "登录", exact: true }).click();
  try {
    await page.waitForURL(base + "/");
  } catch (error) {
    console.error({ url: page.url(), alerts: await page.getByRole("alert").allTextContents(), cookies: (await context.cookies()).map(({ name, httpOnly, secure, sameSite }) => ({ name, httpOnly, secure, sameSite })) });
    throw error;
  }
  await page.getByRole("button", { name: "退出登录", exact: true }).waitFor();
  const cookieValues = await context.cookies();
  const sessionCookies = cookieValues.filter((c) => c.name.startsWith("sb-"));
  assert.ok(sessionCookies.length);
  assert.ok(sessionCookies.every((c) => c.httpOnly && c.secure && c.sameSite === "Lax"));
  const cookie = sessionCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const authed = await fetch(`${base}/api/config`, { headers: { Cookie: cookie } });
  assert.equal(authed.status, 200);
  assert.equal((await authed.json()).aiConfigured, false);

  const expiredSession = issue(users.owner, true);
  const expiredCookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(expiredSession)).toString("base64url")}`;
  const before = refreshCount;
  const refreshed = await fetch(`${base}/api/config`, { headers: { Cookie: expiredCookie } });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshCount > before, "expired session refreshed");
  assert.ok(refreshed.headers.getSetCookie().some((c) => c.includes("sb-127-auth-token")), "refreshed session returned as cookie");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.waitForURL(`${base}/login`);
  assert.equal((await context.request.get(`${base}/api/questions`)).status(), 401);

  await mkdir("/tmp/interview-auth", { recursive: true });
  await page.screenshot({ path: "/tmp/interview-auth/login-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "/tmp/interview-auth/login-mobile.png", fullPage: true });
  console.log("PASS: all protected API methods, other-account and forged-session rejection, cross-site rejection, login errors, owner login, HttpOnly cookies, session refresh, logout, desktop/mobile screenshots.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await stopped;
  await new Promise((resolve) => mock.close(resolve));
}
