import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { authConfigured, isOwner, supabaseUrl } from "./auth-config";

export async function createAuthClient() {
  if (!authConfigured()) throw new Error("登录服务尚未配置。");
  const store = await cookies();
  return createServerClient(supabaseUrl(), process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => store.getAll(),
      setAll: (values) => {
        try {
          values.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; middleware refreshes them instead.
        }
      },
    },
  });
}

export async function getAuthenticatedUser() {
  if (!authConfigured()) return null;
  try {
    const client = await createAuthClient();
    const { data, error } = await client.auth.getUser();
    return error ? null : data.user;
  } catch {
    return null;
  }
}

export async function requireOwnerApi(): Promise<NextResponse | null> {
  const responseHeaders = { "Cache-Control": "private, no-store" };
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  let sameOrigin = !origin;
  if (origin) {
    try { sameOrigin = new URL(origin).host === requestHeaders.get("host"); } catch { sameOrigin = false; }
  }
  if (requestHeaders.get("sec-fetch-site") === "cross-site" || !sameOrigin) {
    return NextResponse.json({ error: "不允许跨站请求。" }, { status: 403, headers: responseHeaders });
  }
  if (!authConfigured()) {
    return NextResponse.json({ error: "登录服务尚未配置，请先完成 Supabase Auth 配置。" }, { status: 503, headers: responseHeaders });
  }
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: "请先登录。" }, { status: 401, headers: responseHeaders });
  if (!isOwner(user)) return NextResponse.json({ error: "此账号无权访问题库。" }, { status: 403, headers: responseHeaders });
  return null;
}
