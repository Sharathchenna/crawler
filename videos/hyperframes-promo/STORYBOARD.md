---
format: 1920x1080
duration: 60s
message: "Write HTML. Render video. Built for agents."
arc: Future Pacing (imagine → name product → remove pain → mechanism → outcome → CTA) with feature-benefit progression
audience: developers and AI coding agents
mode: collaborative
music: confident minimal tech underscore
---

## Video direction

Shared invariants every frame inherits — per-frame Scene lines carry only the delta.

- **Palette (from `frame.md`, by role):** `cream` ground (near-black) as the dev canvas; `ink` for primary type; `navy` code surface for the snippet/terminal cards; `coral` as the SOLE voltage — one coral moment per frame (the payoff word, the CTA pill, the spike); `tile`/`tile-strong` for supporting cards. Type by role: display for hero claims, body for support lines, mono for code/commands/hashes, kicker with ✱ spike for eyebrows.
- **Motion grammar:** smooth long-tail settles (`power3` default, never bouncy) + VO-paced reveals (each piece enters on its spoken cue, sequenced across the back ~50%; window count follows the VO, never front-loaded) + holds that read still (at most subtle jitter, low-amplitude, finite). Seam cuts inside a frame are velocity-matched (`cut-catalog.md`).
- **Rhythm / held frames:** Frames 2, 5, 7 end on deliberate held reads (promise lockup, determinism proof, CTA command); Frame 6 is the energetic peak (tile cascade + count-up). Stillness is placed, never leftover.
- **Negative list:** no browser chrome/nav/footers/scrollbars; no purple-blue AI gradients or floating bokeh; no CSS `transition`/`@keyframes` motion (all motion in the paused GSAP timeline); no infinite loops, no randomness, no wall-clock; no lazy breathing, no back-half camera drift; no front-load-then-freeze (slideshow) and no independently-floating everything (screensaver).
- **Caption band:** content lives in the top ~83%; bottom ~17% stays clear for the caption pill.

## Frame 1 — Not a timeline. A web page.

- scene: Cycling edit-suite names violently replaced by one hero claim on a dark dev canvas
- voiceover: "After Effects, Premiere, a React build — no. This video is a web page."
- duration: 4.971s
- transition_in: cut
- status: animated
- src: compositions/frames/01-hook.html
- type: hook
- persuasion: Negative contrast
- beat: curiosity + intrigue
- blueprint: ticker-takeover (Reproduce)
- focal: none — pure typography beat
- sfx: impact-bass-1

Scene 1 (0.0–2.2s): cream ground; centered display lines cycle in place via in-place token cycle (`discrete-text-sequence`) — "After Effects" → "Premiere" → "a React build" — Trio composition, ~60% of frame, each token hard-cutting on its spoken cue.
Scene 2 (2.2–3.1s): "no." crashes in and shoves the cycle aside via scale-swap (`scale-swap-transition`); coral edge flashes once on the swap.
Scene 3 (3.1–4.971s): hero claim "This video is a web page." resolves centered via per-word staggered reveal (`dynamic-content-sequencing`); keyword glow (`asr-keyword-glow`) lands on "web page" as the VO says it; holds still and reads.

narrativeRole: Hook in the viewer's outcome language — video without timelines or framework builds — creating the tension the promise resolves.
keyMessage: This video was a web page.

## Frame 2 — Introducing HyperFrames

- scene: Kinetic type beats land the name and the one-line promise, resolving on the brand mark
- voiceover: "Introducing HyperFrames — write HTML, render video."
- duration: 4.011s
- transition_in: zoom-through
- status: outline
- src: compositions/frames/02-product-intro.html
- type: product_intro
- persuasion: Category announcement
- beat: clarity + excitement
- blueprint: kinetic-type-beats (Reproduce)
- asset_candidates: assets/logo-d2d0b25a.svg — HyperFrames brand mark from the docs header
- focal: assets/logo-d2d0b25a.svg — brand mark, hero lockup
- roles: logo-d2d0b25a = cutout (foreground hero, type sets around it)
- sfx: pop

Scene 1 (0.0–1.5s): kicker-spike eyebrow "✱ introducing" + "HyperFrames" slams in via kinetic beat-slam (`kinetic-beat-slam`) centered, ~55% of frame; the brand mark assembles beneath as part of the same slam beat.
Scene 2 (1.5–4.011s): promise "write HTML, render video." assembles via per-word staggered reveal (`dynamic-content-sequencing`) under the lockup as the VO speaks it; full lockup holds still to the cut — deliberate held read.

narrativeRole: Name the product and land the brief's message by beat 2 — everything after is evidence.
keyMessage: Write HTML. Render video.

## Frame 3 — Code left. Video right.

- scene: Split screen — a tiny HTML snippet with data-* timing on the left, the real product demo rendering on the right
- voiceover: "Code on the left, video on the right — one source of truth."
- duration: 3.584s
- transition_in: crossfade
- status: animated
- src: compositions/frames/03-mechanism.html
- type: feature_showcase
- persuasion: Show-don't-tell proof
- beat: clarity + control
- blueprint: comparison-split (Adapt — keep the mirrored split-tilt entry signature; the left card is authored mono code, the right card carries the real demo clip instead of a second authored card)
- asset_candidates: assets/journey-introduction-v5-v2.mp4 — the docs' own HTML-to-video demo clip, the rendered-video half
- focal: assets/journey-introduction-v5-v2.mp4 — the docs' own HTML-to-video demo clip, the rendered-video half
- roles: journey-introduction-v5-v2 = cutout (right-half hero); authored code card = supporting (left-half mirror)
- sfx: click-soft

Scene 1 (0.0–1.2s): navy code card (`<div data-start="0">` snippet, mono, 4 lines max) enters from the left via split-tilt cards (`split-tilt-cards`); right half stays dark — only what the VO is saying enters.
Scene 2 (1.2–2.5s): demo clip fades up in the right card exactly as the VO names "video on the right"; both cards settle flat, mirrored tilts resolving to 0.
Scene 3 (2.5–3.584s): center pill "one source of truth" spring-pops with a smooth long-tail settle (`spring-pop-entrance`, no overshoot); frame holds still.

narrativeRole: The mechanism beat — prove the promise with the product's own demo footage, not a claim.
keyMessage: HTML in, MP4 out — no build step.

## Frame 4 — The agent does the editing

- scene: Skill install hands off to working theater — lint, preview, render check off — and the MP4 receipt lands
- voiceover: "The agent drafts the scene — lints, previews, renders — and the MP4 lands."
- duration: 5.227s
- transition_in: crossfade
- status: animated
- src: compositions/frames/04-agent-loop.html
- type: feature_showcase
- persuasion: Friction reduction
- beat: relief + control
- blueprint: agent-progress-theater (Adapt — keep the trigger→theater→receipt spine; the theater is a mono checklist over the dimmed timeline tile, not a modal scan)
- asset_candidates: assets/tile-timeline.mp4 — agent-timeline tile as working-theater texture
- focal: none — the checklist receipt is the hero, authored in place
- roles: tile-timeline = background (full-bleed, dim ~40%, agent-timeline texture)
- sfx: key-press, chime

Scene 1 (0.0–1.4s): terminal card types `npx hyperframes skills update` via type-on with caret (`discrete-text-sequence` + `context-sensitive-cursor`), rule-of-thirds left; tile texture dim behind.
Scene 2 (1.4–3.8s): checklist rows (lint ✓, preview ✓, render ✓) land one per spoken cue via per-word staggered reveal (`dynamic-content-sequencing`), each checking off as named — the back-half reveal.
Scene 3 (3.8–5.227s): "video.mp4" receipt card pops center with coral edge (`spring-pop-entrance`, smooth settle); chime; holds still.

narrativeRole: Remove the pain — no human timeline scrubbing; the "Built for agents" half of the message, shown as work happening.
keyMessage: Agents ship video the way they ship code.

## Frame 5 — Same input. Same frames.

- scene: Two render hashes count up and land identical — deterministic, CI-safe
- voiceover: "Render it twice — frame-identical. Deterministic, built for CI."
- duration: 4.651s
- transition_in: crossfade
- status: animated
- src: compositions/frames/05-determinism.html
- type: benefit_highlight
- persuasion: Statistical proof
- beat: trust + confidence
- blueprint: dataviz-countup (Adapt — keep the count-up-as-argument signature; the "chart" is two mono hashes converging, not a ring)
- focal: none — pure typography beat
- sfx: click-soft

Scene 1 (0.0–1.6s): two mono hash strings type on, upper-third and mid (`discrete-text-sequence`), differing in the last 4 chars — asymmetric 60/40, 3 depth layers over a faint tile ground.
Scene 2 (1.6–3.2s): trailing chars flip-decode into match via 3D char flip-decode (`hacker-flip-3d`) exactly as the VO lands "frame-identical"; marker highlight sweep (`css-marker-patterns`) underscores the match.
Scene 3 (3.2–4.651s): "Deterministic, built for CI." sets as a calm two-line value title with the ✱ coral spike; holds absolutely still — the breather before the peak.

narrativeRole: The outcome beat — turn determinism from an adjective into a counted, on-screen fact.
keyMessage: Deterministic down to the pixel.

## Frame 6 — A whole stack, 44 thousand witnesses

- scene: Capability tiles self-assemble — CLI, catalog, Studio, Lambda — under the star count
- voiceover: "CLI, catalog, Studio, cloud rendering — loved by 44 thousand stargazers."
- duration: 6.08s
- transition_in: crossfade
- status: outline
- src: compositions/frames/06-proof.html
- type: social_proof
- persuasion: Social proof
- beat: belonging + excitement
- blueprint: grid-card-assemble (Reproduce)
- asset_candidates: assets/tile-grading-v2.mp4 — color-grading capability tile; assets/tile-variables.mp4 — variables capability tile; assets/tile-music.mp4 — music capability tile; assets/tile-prvideo.mp4 — PR-video capability tile; assets/tile-hypecard.mp4 — hype-card capability tile; assets/journey-introduction-v5.jpg — docs journey poster
- focal: assets/tile-prvideo.mp4 — center tile, PR-video capability nearest this video's own story
- roles: tile-grading-v2 = supporting; tile-variables = supporting; tile-music = supporting; tile-prvideo = cutout (center hero); tile-hypecard = supporting; journey-introduction-v5 = background (full-bleed poster, dim ~40%)
- sfx: riser, impact-bass-1

Scene 1 (0.0–3.4s): five tiles scale/fade-cascade (`center-outward-expansion`, in-place variant at fixed grid slots so the hoisted tile videos hold exact geometry) into a staggered grid, each landing on its spoken cue (CLI → catalog → Studio → cloud rendering get mono labels under their tiles); riser runs underneath.
Scene 2 (3.4–6.08s): tiles dim back as the star count value-scaled counter (`counting-dynamic-scale`) climbs 0→44K hero-center with "stargazers · tldraw · TanStack" beneath; count lands with impact-bass-1; holds on the number — the energetic peak resolves still.

narrativeRole: Breadth + witnesses — the stack is real and the crowd (44.3k stars, 4.2k forks, tldraw, TanStack) already trusts it.
keyMessage: Production-ready, and the numbers say so.

## Frame 7 — One command and you're rolling

- scene: The brand mark condenses into a terminal pill that types the install command, caret blinking
- voiceover: "One command — npx hyperframes init — and you're rolling."
- duration: 3.947s
- transition_in: zoom-through
- status: outline
- src: compositions/frames/07-cta.html
- type: cta
- persuasion: Friction reduction
- beat: urgency-to-act
- blueprint: prompt-type-submit-generate (Reproduce — install-command CTA variant)
- asset_candidates: assets/logo-f6b5cd65.svg — HyperFrames brand mark for the end-card lockup
- focal: assets/logo-f6b5cd65.svg — brand mark, condenses into the command pill
- roles: logo-f6b5cd65 = cutout (opens the frame, then yields to the pill)
- sfx: pop

Scene 1 (0.0–1.0s): brand mark centered on cream ground; kicker "✱ one command" sets above it.
Scene 2 (1.0–2.9s): mark scales down into a navy terminal pill via scale-swap (`scale-swap-transition`); `npx hyperframes init` types inside via type-on with caret (`discrete-text-sequence` + `context-sensitive-cursor`) exactly as the VO speaks it.
Scene 3 (2.9–3.947s): cursor click + ripple (`cursor-click-ripple`) lands the pill; coral glow blooms and holds; caret keeps blinking into the end hold (exit is the harness cut).

narrativeRole: CTA with the lowest possible friction — free, open-source, one command — spoken as the command types.
keyMessage: npx hyperframes init.
