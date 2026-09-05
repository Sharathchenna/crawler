import { redirect } from "next/navigation";

// Identity is enforced by Cloudflare Access in front of the app —
// everyone who reaches here is authenticated.
export default async function Home() {
  redirect("/library");
}
