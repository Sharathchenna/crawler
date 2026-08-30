import { ImageResponse } from "next/og";
import { INK_COLOR, TERRACOTTA, THEME_COLOR } from "@/lib/config";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: THEME_COLOR,
          color: TERRACOTTA,
          fontSize: 280,
          fontFamily: "Georgia, serif",
          fontStyle: "italic",
          letterSpacing: "-0.04em",
        }}
      >
        <span style={{ color: INK_COLOR, position: "absolute", opacity: 0.08, fontSize: 420 }}>
          P
        </span>
        P
      </div>
    ),
    size,
  );
}
