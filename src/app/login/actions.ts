"use server";

import { redirect } from "next/navigation";
import { createAuthClient } from "@/lib/auth";
import { authConfigured, isOwner } from "@/lib/auth-config";

export type LoginState = { error: string | null };

export async function login(_previous: LoginState, form: FormData): Promise<LoginState> {
  if (!authConfigured()) return { error: "登录服务尚未配置。" };
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const failed = { error: "邮箱或密码不正确，或账号没有访问权限。" };
  if (!email || !password || password.length > 1024 || email !== process.env.APP_OWNER_EMAIL?.trim().toLowerCase()) return failed;
  try {
    const client = await createAuthClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return failed;
    if (!isOwner(data.user)) {
      await client.auth.signOut({ scope: "local" });
      return failed;
    }
  } catch {
    return { error: "登录服务暂时不可用，请稍后重试。" };
  }
  redirect("/");
}

export async function logout() {
  if (authConfigured()) {
    const client = await createAuthClient();
    await client.auth.signOut({ scope: "local" });
  }
  redirect("/login");
}
