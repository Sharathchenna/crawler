import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { userFromHeaders } from "@/lib/auth";
import { Shell } from "@/components/Shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Cloudflare Access guarantees identity; auto-provision on first sight.
  // Local dev without Access uses DEV_ACCESS_EMAIL (never set in prod).
  // Direct hits with no identity at all get a 404, not a login form.
  const user = await userFromHeaders(await headers());
  if (!user) notFound();
  return <Shell email={user.email}>{children}</Shell>;
}
