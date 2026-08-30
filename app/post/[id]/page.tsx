import { notFound, redirect } from "next/navigation";
import { getPost } from "@/lib/posts";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await getPost(Number(id));
  if (!post) {
    notFound();
  }
  redirect(post.url);
}
