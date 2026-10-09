import { redirect } from "next/navigation";
import QuestionWorkspace from "@/components/question-workspace";
import { getAuthenticatedUser } from "@/lib/auth";
import { isOwner } from "@/lib/auth-config";

export default async function HomePage() {
  const user = await getAuthenticatedUser();
  if (!isOwner(user)) redirect("/login");
  return <QuestionWorkspace email={user!.email!} />;
}
