import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { verifySession } from "@/lib/auth";

export default async function Home() {
  const store = await cookies();
  const userId = await verifySession(store.get("hoard_session")?.value);
  redirect(userId ? "/library" : "/login");
}
