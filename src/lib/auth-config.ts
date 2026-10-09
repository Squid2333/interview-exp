import type { User } from "@supabase/supabase-js";

export function authConfigured(): boolean {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY || !process.env.APP_OWNER_EMAIL) return false;
  try {
    const url = new URL(process.env.SUPABASE_URL);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function supabaseUrl(): string {
  return new URL(process.env.SUPABASE_URL!).origin;
}

export function isOwner(user: User | null): boolean {
  const owner = process.env.APP_OWNER_EMAIL?.trim().toLowerCase();
  return Boolean(owner && user?.email_confirmed_at && user.email?.toLowerCase() === owner);
}
