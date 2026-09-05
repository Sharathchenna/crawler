import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const userId = await verifySession(store.get("hoard_session")?.value);
  if (!userId) redirect("/login");
  const user = await getDb().user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");
  return <Shell email={user.email}>{children}</Shell>;
}
