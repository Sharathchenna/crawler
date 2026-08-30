import Markdown from "react-markdown";

export function PostBody({ markdown }: { markdown: string }) {
  return (
    <div className="prose-parchment">
      <Markdown>{markdown}</Markdown>
    </div>
  );
}
