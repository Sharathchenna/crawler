---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Write HTML. Render video. Built for agents."
destination: youtube
aspect: 1920x1080
language: en
length: 60s
angle: promo
audience: developers
---

## Intent

Marketing promo for HyperFrames (heygen-com/hyperframes) that explores the code: an agent writes a tiny HTML snippet on a dark dev canvas and the right half renders live into video. Prove determinism (same input, same frames), flash the stack (CLI, Core/Engine/Producer, Catalog, Studio/Lambda), close on 44.3k stars + `npx hyperframes init`. Dev-confident dark + code feel for developers and coding agents. User wording: "i want to create a video for this marketing for this code explore the code"; "I don't know video".

## Assets

- No user-supplied files yet. Capture will source from https://hyperframes.heygen.com/introduction (brand + docs) and https://github.com/heygen-com/hyperframes (stars/proof).

## Customizations

- Split-screen code-to-video reveal (left HTML types, right video renders live).
- Real captured docs/GitHub proof beats (stars, CLI commands, catalog cards).
- Beat-cut background music; TTS narration (voice TBD at Step 3.1).
- Code legibility rule: 3-5 lines max per frame at 1920x1080.

## Notes

- Source tagline: "Write HTML. Render video. Built for agents." Open-source Apache 2.0, deterministic MP4, no build step, seekable animations (GSAP/CSS/Lottie/Three.js/Anime.js/WAAPI), agent skills for Claude Code/Cursor/Gemini/Codex.
- Avoid generic terminal-typing feature-list montage (the anti-pattern left behind).
- First time recording preferences: destination, aspect, flow, storyboard will be remembered for future runs.
