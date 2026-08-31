"use client";

import { useEffect, useRef, useState } from "react";
import { tweetStatusId } from "@/shared/tweet";

type TweetFactory = {
  createTweet: (
    id: string,
    element: HTMLElement,
    options?: {
      theme?: "light" | "dark";
      dnt?: boolean;
      conversation?: "none" | "all";
      align?: "center" | "left" | "right";
    },
  ) => Promise<HTMLElement | undefined>;
};

type TwitterAPI = {
  ready: (callback: (api: TwitterAPI) => void) => void;
  widgets: TweetFactory;
  _e?: Array<(api: TwitterAPI) => void>;
};

function twitter(): TwitterAPI | undefined {
  return (window as Window & { twttr?: TwitterAPI }).twttr;
}

function ensureTwitterStub(): TwitterAPI {
  const current = twitter();
  if (current?.ready) {
    return current;
  }
  const stub: TwitterAPI = {
    _e: [],
    ready(callback) {
      this._e?.push(callback);
    },
    widgets: undefined as unknown as TweetFactory,
  };
  (window as Window & { twttr?: TwitterAPI }).twttr = stub;
  return stub;
}

let widgetsReady: Promise<TweetFactory> | null = null;

function loadTwitterWidgets(): Promise<TweetFactory> {
  const already = twitter()?.widgets;
  if (already) {
    return Promise.resolve(already);
  }
  if (widgetsReady) {
    return widgetsReady;
  }

  widgetsReady = new Promise((resolve, reject) => {
    const stub = ensureTwitterStub();
    stub.ready((api) => {
      if (api.widgets) {
        resolve(api.widgets);
        return;
      }
      reject(new Error("twitter_widgets_missing"));
    });

    if (!document.getElementById("twitter-wjs")) {
      const script = document.createElement("script");
      script.id = "twitter-wjs";
      script.src = "https://platform.twitter.com/widgets.js";
      script.async = true;
      script.onerror = () => reject(new Error("twitter_widgets_failed"));
      document.body.appendChild(script);
    }
  });

  return widgetsReady;
}

export function TweetEmbed({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const id = tweetStatusId(url);

  useEffect(() => {
    if (!id || !hostRef.current) {
      return;
    }
    const host = hostRef.current;
    host.replaceChildren();
    let cancelled = false;

    loadTwitterWidgets()
      .then((widgets) => {
        if (cancelled) {
          return undefined;
        }
        return widgets.createTweet(id, host, {
          theme: "light",
          dnt: true,
          conversation: "none",
          align: "center",
        });
      })
      .then((frame) => {
        if (!cancelled && !frame) {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
        }
      });

    return () => {
      cancelled = true;
      host.replaceChildren();
    };
  }, [id]);

  if (!id || failed) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-40 items-center justify-center px-5 py-8 text-sm text-terracotta"
      >
        Open this post on X
      </a>
    );
  }

  return <div ref={hostRef} className="flex min-h-40 justify-center px-2 pt-2 pb-1" />;
}
