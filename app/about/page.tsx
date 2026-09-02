import type { Metadata } from "next";
import { APP_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "About",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="text-4xl font-semibold tracking-tight text-ink">
        Two shelves, one library.
      </h1>
      <div className="prose-parchment mt-8">
        <p>
          <strong>Yours</strong> is whatever you paste: a tweet, an arXiv paper,
          a blog, a GitHub repo. Click Save and it lands here, then opens the
          original when you click the card.
        </p>
        <p>
          <strong>Suggested</strong> is the crawler. A Cloudflare Worker looks
          at Hacker News favorites, new arXiv papers, and TinyFish search over
          company blogs. It scores what it finds and files it for you. Locally
          it does not run on a timer — use Find more. In production it runs
          every six hours.
        </p>
        <p>
          Like, pass, or mark a card <strong>read</strong> and it leaves the
          live shelves for <strong>Archive</strong>, so Yours and Suggested stay
          unread. Likes raise similar sites, topics, and types in Suggested.
          Passes bury them, and the crawler stops fetching domains you keep
          passing. Restore anything from Archive if you want it back.
        </p>
        <p>
          {APP_NAME} does not replace the source. Tweets are stored as links
          (no X API). Import X bookmarks from{" "}
          <a href="https://birdclaw.sh/">birdclaw</a> JSON, JSONL, or a list of
          tweet URLs — birdclaw stays local; Parchment only receives what you
          paste. Papers keep the abstract. Search is keyword today; embeddings +
          Vectorize turn on after Cloudflare login.
        </p>
        <p>
          Light is cream paper. Dark is ink. Theme lives in the sidebar and
          follows your system until you pin one.
        </p>
      </div>
    </main>
  );
}
