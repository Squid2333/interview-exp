import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServerClient } from "@supabase/ssr";
import pg from "pg";
import { databaseOptions } from "../src/lib/database-options.mjs";

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
    ["/api/categories", "GET"], ["/api/categories", "POST"], ["/api/categories", "PATCH"], ["/api/categories", "DELETE"],
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
  const timestamp = new Date().toISOString();
  const question = {
    id: "fixture-question", title: "HashMap 为什么线程不安全？", category: "Java", tags: ["HashMap"],
    status: "todo", createdAt: timestamp, updatedAt: timestamp, nextReviewAt: null, noteCount: 0,
    hasAnswer: false, answer: null, messages: [], notes: [], isFavorite: false,
  };
  let mockCategories = [{ name: "Java", questionCount: 1 }, { name: "其他", questionCount: 0 }];
  await page.route("**/api/config", (route) => route.fulfill({ json: { aiConfigured: true } }));
  await page.route("**/api/categories", async (route) => {
    const method = route.request().method();
    const body = method === "GET" ? {} : route.request().postDataJSON();
    if (method === "POST") mockCategories = [...mockCategories.slice(0, -1), { name: body.name, questionCount: 0 }, mockCategories.at(-1)];
    if (method === "PATCH") mockCategories = mockCategories.map((item) => item.name === body.name ? { ...item, name: body.newName } : item);
    if (method === "DELETE") mockCategories = mockCategories.filter((item) => item.name !== body.name);
    await route.fulfill({ json: { categories: mockCategories } });
  });
  await page.route("**/api/questions**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/answer")) {
      question.hasAnswer = true;
      question.answer = { id: "fixture-answer", source: "ai", createdAt: timestamp, content: "## 核心原因\n\nHashMap 在并发修改时没有同步保护，多个线程可能覆盖彼此的更新。\n\n### 示例\n\n- 多个线程同时 put，可能丢失更新。\n- 遍历期间修改，可能触发异常。\n\n```java\nMap<String, Integer> map = new ConcurrentHashMap<>();\n```" };
    }
    if (url.pathname === "/api/questions/fixture-question" && route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      question.isFavorite = body.isFavorite;
    }
    if (url.pathname === "/api/questions") {
      const visible = (!url.searchParams.get("status") || url.searchParams.get("status") === question.status) && (!url.searchParams.get("favorites") || question.isFavorite);
      await route.fulfill({ json: { questions: visible ? [question] : [], stats: { total: 1, todo: 1, mastered: 0, due: 0, favorites: question.isFavorite ? 1 : 0 }, categories: mockCategories.map((item) => item.name) } });
    } else {
      await route.fulfill({ json: { question } });
    }
  });
  await page.reload();
  await page.getByRole("button", { name: "管理知识分类" }).click();
  await page.getByLabel("新分类名称").fill("Kubernetes");
  await page.getByRole("button", { name: "新增", exact: true }).click();
  await page.getByRole("button", { name: "重命名 Kubernetes" }).waitFor();
  await page.getByRole("button", { name: "重命名 Kubernetes" }).click();
  await page.getByLabel("重命名 Kubernetes").fill("云原生");
  await page.getByRole("button", { name: "保存分类名称" }).click();
  await page.getByRole("button", { name: "删除 云原生" }).waitFor();
  await page.getByRole("button", { name: "关闭分类管理" }).click();
  assert.ok(await page.getByLabel("修改分类").locator("option[value='云原生']").count(), "custom category appears in question selector");
  await page.getByRole("button", { name: "管理知识分类" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除 云原生" }).click();
  await page.getByRole("button", { name: "删除 云原生" }).waitFor({ state: "detached" });
  await page.getByRole("button", { name: "关闭分类管理" }).click();
  assert.equal(await page.getByLabel("修改分类").locator("option[value='云原生']").count(), 0, "removed category leaves selector");
  await page.getByRole("button", { name: /^待掌握/ }).click();
  await page.getByRole("button", { name: "生成参考答案" }).click();
  await page.locator("article.markdown-body").waitFor();
  assert.equal(await page.locator(".question-row.selected").count(), 1, "generated answer stays selected in pending list");
  assert.equal(await page.getByLabel("修改状态").inputValue(), "todo");
  await page.getByRole("button", { name: "收藏题目" }).click();
  await page.getByRole("button", { name: "取消收藏" }).waitFor();
  await page.getByRole("button", { name: /^我的收藏/ }).click();
  assert.equal(await page.locator(".question-row").count(), 1, "favorite remains visible in favorites filter");
  await page.getByRole("button", { name: /^全部题目/ }).click();
  assert.equal(await page.locator(".main-nav").getByText("学习中").count(), 0);
  assert.equal(await page.locator("article.markdown-body").evaluate((node) => getComputedStyle(node).fontSize), "16px");
  assert.equal(await page.getByRole("tab").count(), 2);
  await page.getByLabel("输入追问").fill("为什么会丢失更新？");
  await page.getByRole("tab", { name: /我的薄弱点/ }).click();
  assert.equal(await page.locator("article.markdown-body").isVisible(), true, "answer remains visible in notes tab");
  assert.equal(await page.getByLabel("添加薄弱点").isVisible(), true);
  assert.equal(await page.getByLabel("输入追问").isVisible(), false);
  await page.getByLabel("添加薄弱点").fill("并发更新过程还不清楚");
  await page.getByRole("tab", { name: /追问讨论/ }).click();
  assert.equal(await page.locator("article.markdown-body").isVisible(), true, "answer remains visible in discussion tab");
  assert.equal(await page.getByLabel("输入追问").inputValue(), "为什么会丢失更新？");
  await page.getByRole("tab", { name: /我的薄弱点/ }).click();
  assert.equal(await page.getByLabel("添加薄弱点").inputValue(), "并发更新过程还不清楚");
  await page.getByRole("tab", { name: /追问讨论/ }).click();
  const listBounds = await page.getByRole("region", { name: "题目列表" }).boundingBox();
  assert.ok(listBounds.width <= 280, "compact question list");
  const expandedWidth = (await page.getByRole("region", { name: "题目详情" }).boundingBox()).width;
  await page.getByRole("button", { name: "收起题目列表" }).click();
  assert.equal(await page.locator("#question-list").isVisible(), false);
  assert.ok((await page.getByRole("region", { name: "题目详情" }).boundingBox()).width > expandedWidth);
  await mkdir("/tmp/interview-auth", { recursive: true });
  await page.screenshot({ path: "/tmp/interview-auth/workspace-collapsed.png", fullPage: true });
  await page.getByRole("button", { name: "展开题目列表" }).click();
  await page.screenshot({ path: "/tmp/interview-auth/workspace-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "管理知识分类" }).click();
  await page.getByRole("dialog", { name: "管理知识分类" }).waitFor();
  await page.screenshot({ path: "/tmp/interview-auth/category-manager-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "关闭分类管理" }).click();
  await page.getByRole("button", { name: "只看收藏", exact: true }).click();
  await page.getByRole("heading", { name: "我的收藏." }).waitFor();
  await page.getByRole("button", { name: "查看全部题目", exact: true }).click();
  await page.getByRole("heading", { name: "全部题目." }).waitFor();
  await page.screenshot({ path: "/tmp/interview-auth/workspace-mobile.png", fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole("button", { name: "取消收藏" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "取消收藏" }).getAttribute("aria-pressed"), "true", "favorite state survives page reload");
  await page.getByRole("button", { name: /^我的收藏/ }).click();
  await page.getByRole("button", { name: "取消收藏" }).click();
  await page.getByText("没有符合条件的题目", { exact: true }).waitFor();
  assert.equal(await page.locator(".question-row").count(), 0, "unfavoriting removes question from favorites list");
  await page.getByRole("button", { name: /^全部题目/ }).click();
  await page.getByRole("button", { name: "收藏题目" }).waitFor();
  assert.equal(await page.getByLabel("修改状态").inputValue(), "todo", "favorites are independent of learning status");
  const cookie = sessionCookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const authed = await fetch(`${base}/api/config`, { headers: { Cookie: cookie } });
  assert.equal(authed.status, 200);
  assert.equal((await authed.json()).aiConfigured, false);

  const pool = new pg.Pool({ ...databaseOptions(), max: 1 });
  const favoriteId = `favorite-test-${crypto.randomUUID()}`;
  const reviewAt = "2099-01-01T00:00:00.000Z";
  try {
    await pool.query("INSERT INTO questions (id,title,normalized_title,category,status,next_review_at,created_at,updated_at) VALUES ($1,$2,$1,'Java','mastered',$3,$4,$4)", [favoriteId, "收藏功能验证临时题目", reviewAt, timestamp]);
    const questionUrl = `${base}/api/questions/${favoriteId}`;
    const patch = (body) => fetch(questionUrl, { method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    assert.equal((await patch({ isFavorite: "true" })).status, 400, "rejects invalid favorite type");
    assert.equal((await patch({ isFavorite: true })).status, 200);
    const saved = (await (await fetch(questionUrl, { headers: { Cookie: cookie } })).json()).question;
    assert.equal(saved.isFavorite, true, "favorite persisted through real API and database");
    assert.equal(saved.status, "mastered");
    assert.equal(saved.nextReviewAt, reviewAt);
    assert.equal(saved.updatedAt, timestamp, "favorite leaves sort timestamp unchanged");
    const favorites = await (await fetch(`${base}/api/questions?favorites=true&category=Java&search=${favoriteId}`, { headers: { Cookie: cookie } })).json();
    assert.equal(favorites.questions.length, 0, "favorites respects search");
    const listed = await (await fetch(`${base}/api/questions?favorites=true&category=Java`, { headers: { Cookie: cookie } })).json();
    assert.ok(listed.questions.some((item) => item.id === favoriteId));
    assert.ok(listed.questions.every((item) => item.isFavorite && item.category === "Java"));
    assert.equal((await patch({ isFavorite: false })).status, 200);
    const removed = (await (await fetch(questionUrl, { headers: { Cookie: cookie } })).json()).question;
    assert.equal(removed.isFavorite, false);
  } finally {
    await pool.query("DELETE FROM questions WHERE id=$1", [favoriteId]);
    await pool.end();
  }

  const categoryPool = new pg.Pool({ ...databaseOptions(), max: 1 });
  const categorySuffix = crypto.randomUUID().slice(0, 8);
  const categoryName = `CodexTest${categorySuffix}`;
  const renamedCategory = `CodexRenamed${categorySuffix}`;
  const categoryQuestionId = `category-test-${crypto.randomUUID()}`;
  const categoryRequest = (method, body) => fetch(`${base}/api/categories`, {
    method,
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  try {
    assert.equal((await categoryRequest("POST", { name: "x".repeat(31) })).status, 400);
    assert.equal((await categoryRequest("POST", { name: categoryName })).status, 201);
    assert.equal((await categoryRequest("POST", { name: categoryName.toLowerCase() })).status, 409);
    const catalog = await (await categoryRequest("GET")).json();
    assert.ok(catalog.categories.some((item) => item.name === categoryName && item.questionCount === 0), "empty categories remain visible");
    await categoryPool.query("INSERT INTO questions (id,title,normalized_title,category,created_at,updated_at) VALUES ($1,$2,$1,$3,$4,$4)", [categoryQuestionId, "分类管理验证临时题目", categoryName, timestamp]);
    await categoryPool.query("INSERT INTO answers (id,question_id,content,source,created_at) VALUES ($1,$2,$3,'manual',$4)", [crypto.randomUUID(), categoryQuestionId, "保留答案", timestamp]);
    assert.equal((await categoryRequest("PATCH", { name: categoryName, newName: renamedCategory })).status, 200);
    const renamedQuestion = (await (await fetch(`${base}/api/questions/${categoryQuestionId}`, { headers: { Cookie: cookie } })).json()).question;
    assert.equal(renamedQuestion.category, renamedCategory, "renaming cascades to existing questions");
    assert.equal(renamedQuestion.answer.content, "保留答案");
    assert.equal((await categoryRequest("DELETE", { name: "其他" })).status, 400);
    assert.equal((await categoryRequest("DELETE", { name: renamedCategory })).status, 200);
    const reassignedQuestion = (await (await fetch(`${base}/api/questions/${categoryQuestionId}`, { headers: { Cookie: cookie } })).json()).question;
    assert.equal(reassignedQuestion.category, "其他", "deleting moves questions to Other");
    assert.equal(reassignedQuestion.answer.content, "保留答案", "deleting category preserves answer");
  } finally {
    await categoryPool.query("DELETE FROM questions WHERE id=$1", [categoryQuestionId]);
    await categoryPool.query("DELETE FROM categories WHERE name IN ($1,$2)", [categoryName, renamedCategory]);
    await categoryPool.end();
  }

  const expiredSession = issue(users.owner, true);
  const expiredCookie = `sb-127-auth-token=base64-${Buffer.from(JSON.stringify(expiredSession)).toString("base64url")}`;
  const before = refreshCount;
  const refreshed = await fetch(`${base}/api/config`, { headers: { Cookie: expiredCookie } });
  assert.equal(refreshed.status, 200);
  assert.ok(refreshCount > before, "expired session refreshed");
  assert.ok(refreshed.headers.getSetCookie().some((c) => c.includes("sb-127-auth-token")), "refreshed session returned as cookie");
  await page.unroute("**/api/config");
  await page.unroute("**/api/questions**");
  await page.unroute("**/api/categories");
  await page.getByRole("button", { name: "退出登录", exact: true }).click();
  await page.waitForURL(`${base}/login`);
  assert.equal((await context.request.get(`${base}/api/questions`)).status(), 401);

  await mkdir("/tmp/interview-auth", { recursive: true });
  await page.screenshot({ path: "/tmp/interview-auth/login-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.screenshot({ path: "/tmp/interview-auth/login-mobile.png", fullPage: true });
  console.log("PASS: protected APIs, owner login, cookies, refresh, logout, category management UI/API/cascade, favorites, pending question retained after generation, list collapse/expand, desktop/mobile layout.");
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await stopped;
  await new Promise((resolve) => mock.close(resolve));
}
