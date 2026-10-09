import { redirect } from "next/navigation";
import { BookOpen } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/auth";
import { authConfigured, isOwner } from "@/lib/auth-config";
import LoginForm from "./login-form";

export default async function LoginPage() {
  const user = await getAuthenticatedUser();
  if (isOwner(user)) redirect("/");
  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand"><BookOpen size={24} /><span>知题</span></div>
        <h1 id="login-title">登录你的题库</h1>
        <LoginForm configured={authConfigured()} unauthorized={Boolean(user)} />
      </section>
    </main>
  );
}
