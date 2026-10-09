import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { authConfigured, supabaseUrl } from "@/lib/auth-config";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  if (!authConfigured()) return response;
  const client = createServerClient(supabaseUrl(), process.env.SUPABASE_PUBLISHABLE_KEY!, {
    cookieOptions: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        response.headers.set("Cache-Control", "private, no-store");
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  try {
    await client.auth.getUser();
  } catch {
    // Pages and API handlers independently reject unauthenticated requests.
  }
  return response;
}

export const config = { matcher: ["/", "/login", "/api/:path*"] };
