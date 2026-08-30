"use client";

import { useState } from "react";
import { screenshotUrl } from "@/lib/format";

export function PageShot({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  if (failed) {
    return null;
  }

  return (
    // Native img: mShots URLs are generated on first hit and are a poor fit for next/image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={screenshotUrl(url)}
      alt=""
      loading="lazy"
      decoding="async"
      className={`absolute inset-0 h-full w-full object-cover object-top transition duration-500 ${
        loaded ? "opacity-100" : "opacity-0"
      }`}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  );
}
