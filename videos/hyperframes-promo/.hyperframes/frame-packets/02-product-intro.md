# Frame packet: 02-product-intro

## Project inputs

- Project: /Users/sharathchenna/Developer/personal-projects/crawler/videos/hyperframes-promo
- Design tokens: /Users/sharathchenna/Developer/personal-projects/crawler/videos/hyperframes-promo/frame.md
- RULES_DIR: /Users/sharathchenna/Developer/personal-projects/crawler/.agents/skills/hyperframes-animation/rules

## Assigned storyboard block

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

Scene 1 (0.0–1.5s): kicker-spike eyebrow "✱ introducing" + "HyperFrames" slams in via kinetic beat-slam (`kinetic-beat-slam`) centered, ~55% of frame; brand mark draws itself beneath via SVG self-draw (`svg-path-draw`).
Scene 2 (1.5–4.011s): promise "write HTML, render video." assembles via per-word staggered reveal (`dynamic-content-sequencing`) under the lockup as the VO speaks it; full lockup holds still to the cut — deliberate held read.

narrativeRole: Name the product and land the brief's message by beat 2 — everything after is evidence.
keyMessage: Write HTML. Render video.

## Selected motion rule: dynamic-content-sequencing

---
name: dynamic-content-sequencing
description: Auto-calculate timeline start/end times from content length + per-item duration config — longer content gets more screen time without hardcoded numbers.
metadata:
  tags: timeline, sequencing, dynamic, duration, content-aware, utility
---

# Dynamic Content Sequencing

A utility pattern (not a motion rule in itself) for scenes that show a SEQUENCE of items (cards, phrases, stats): each item's duration is computed from its content length + per-item config, and the sequencer assigns absolute start/end times automatically — no hardcoded offsets per item. Distinct from [discrete-text-sequence](discrete-text-sequence.md) (one text element changing states) — this rule swaps between distinct content blocks.

## How It Works

A content array of `{ eyebrow, title, body, speedFactor, hold }` entries is reduced once at build time into a flat `TIMELINE` of `{ …entry, start, end }` — duration per entry is `BASE_DURATION + body.length × SEC_PER_CHAR + hold`, so longer text earns more reading time. A single linear driver's `onUpdate` reverse-searches the active entry and swaps the DOM **only on transitions** (a `lastTitle` guard — per-frame `textContent` writes flicker in render); an optional progress bar fills 0→100% across the whole run.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="display">
  <div class="eyebrow" id="eyebrow"></div>
  <div class="title" id="title"></div>
  <div class="body" id="body"></div>
  <div class="progress-bar"><div class="progress-fill" id="progress-fill"></div></div>
</div>
```

```css
.body {
  min-height: 160px; /* reserve space — content height varies; without this, layout jumps */
}
.progress-fill {
  height: 100%;
  width: 0%;
}
```

```js
// N entries, each with its own pacing (optionally a speedFactor multiplier);
// the final entry uses a larger hold (closing beat).
const CONTENT = [
  { eyebrow: "{eyebrow1}", title: "{title1}", body: "{body1}", hold: HOLD_MID },
  // …
  { eyebrow: "{eyebrowN}", title: "{titleN}", body: "{bodyN}", hold: HOLD_FINAL },
];

// Pre-compute absolute start/end ONCE — never in onUpdate.
let cumulative = 0;
const TIMELINE = CONTENT.map((entry) => {
  const dur = BASE_DURATION + entry.body.length * SEC_PER_CHAR + entry.hold;
  const start = cumulative;
  cumulative += dur;
  return { ...entry, start, end: cumulative };
});

function entryAt(time) {
  for (let i = TIMELINE.length - 1; i >= 0; i--) {
    if (time >= TIMELINE[i].start) return TIMELINE[i];
  }
  return TIMELINE[0];
}

const eyebrowEl = document.getElementById("eyebrow");
const titleEl = document.getElementById("title");
const bodyEl = document.getElementById("body");
const progressEl = document.getElementById("progress-fill");

const TOTAL_DURATION = cumulative + TAIL_PAD;
const driver = { t: 0 };
let lastTitle = "";

tl.to(
  driver,
  {
    t: TOTAL_DURATION,
    duration: TOTAL_DURATION,
    ease: "none",
    onUpdate: () => {
      const entry = entryAt(driver.t);
      // Swap content only on transitions — no per-frame DOM thrash
      if (entry.title !== lastTitle) {
        eyebrowEl.textContent = entry.eyebrow;
        titleEl.textContent = entry.title;
        bodyEl.textContent = entry.body;
        lastTitle = entry.title;
      }
      progressEl.style.width = `${(driver.t / TOTAL_DURATION) * 100}%`;
    },
  },
  0,
);
```

## Variations

- **Crossfade between items** — return BOTH adjacent entries during an overlap window (`time ≥ e.start − overlap && time ≤ e.end + overlap`, overlap ≈ 0.3s) and render them with opacities computed from distance to the boundary.
- **Per-item motion variation** — map an `entry.style` key to an existing rule per chapter (e.g. `3d-text-depth-layers` → `hacker-flip-3d` → `counting-dynamic-scale`); the sequencer only orchestrates timing.
- **Auto-extend composition duration** — you can set `data-duration` from the computed `TOTAL_DURATION` in script, but HF reads `data-duration` at composition load and setting it after init may not take effect — author the duration manually from a rough total.

### Accelerating cadence (geometric hold decay)

For rhetorical escalation — "everyone says…", a roll-call, a praise flurry — the beat grid itself accelerates: early entries hold ~1s (read speed), then windows shrink geometrically into a ~0.15–0.3s flurry, braking on an emphasis state before the resolve. The acceleration is pre-computed into the same flat `TIMELINE` — still content-driven, still deterministic, no speed-up tween anywhere:

```js
// Geometric decay on the hold, clamped at a flurry floor; the brake state holds longest.
const HOLDS = CONTENT.map((entry, i) => Math.max(FLURRY_FLOOR, HOLD_START * Math.pow(DECAY, i)));
HOLDS[CONTENT.length - 1] = HOLD_FINAL;

let cumulative = 0;
const TIMELINE = CONTENT.map((entry, i) => {
  // Past ~0.5s states are glanced as motion texture, not read —
  // drop the per-char term or you never reach flurry speed.
  const readable = HOLDS[i] >= READ_THRESHOLD;
  const dur = HOLDS[i] + (readable ? entry.body.length * SEC_PER_CHAR : 0);
  const start = cumulative;
  cumulative += dur;
  return { ...entry, start, end: cumulative };
});
```

Worked example — **praise-chip flurry**: ~16 short quotes hard-cut through a chip beside a pinned wordmark. First 3 states at `HOLD_START = 1.0` (each reads fully); `DECAY = 0.8` shrinks every following window until `FLURRY_FLOOR = 0.2` catches it (≈12 states over ~2.5s — a churn of acclaim, individually glanced); the longest phrase takes `HOLD_FINAL ≈ 1.6` as the brake before the closing lockup.

Values: `HOLD_START` 0.8–1.2s; `DECAY` 0.75–0.88 (higher = longer runway before the flurry bites); `FLURRY_FLOOR` 0.15–0.3s (below ~0.15s swaps strobe); `READ_THRESHOLD` ~0.5s; brake ≥ 4× the floor or the stop doesn't register as a beat. The 3–6 entry guidance relaxes here — 12–18 states are legal precisely because flurry states aren't individually read. The hard-cut discipline (`lastTitle` guard, instant swaps) is what lets 0.2s states render clean.

## Values

| token         | range                 | notes                                                                                                                 |
| ------------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| BASE_DURATION | 0.6–1.5s              | minimum per entry regardless of length — even one-word entries get read time                                          |
| SEC_PER_CHAR  | 0.03–0.06 s/char      | ≈17–33 chars/sec; uniform across the sequence so the pace reads as one engine; lean high for wide-character languages |
| HOLD_MID      | 0.5–1.0s              | dwell on a non-final entry; `< HOLD_FINAL`                                                                            |
| HOLD_FINAL    | 1.0–2.0s              | climax dwell — must exceed HOLD_MID by a clear margin so the close reads as a beat                                    |
| SPEED_FACTOR  | 0.5–2.0 (default 1.0) | per-entry only; if every entry shares a factor, fold it into SEC_PER_CHAR                                             |
| TAIL_PAD      | 0.0–1.0s              | quiet beat after the last entry; prefer 0 when the next composition owns the breath                                   |
| CONTENT N     | 3–6 entries           | <3 isn't a sequence; >6 drags (accelerating cadence relaxes this — see above)                                         |

Reference: `../../examples/messaging-multi-phrase.html`.

## Critical Constraints

- **Pre-compute the TIMELINE once at build** — never recompute in `onUpdate`; the reverse search over the flat array is the whole per-frame cost.
- **DOM swap only on entry transition** (`lastTitle`/key guard) — per-frame `textContent` assignment flickers in HF render.
- **`min-height` on the body element** — without reservation, downstream elements (progress bar, brand) jitter as content height varies.
- **Sequential only** — for parallel tracks use a different reduction.
- **Titles fit one line at the chosen size; bodies fit inside `min-height` after wrapping.**

## See also

`discrete-text-sequence` (per-entry typewriter on the body) · `context-sensitive-cursor` (cursor color per chapter) · `vertical-spring-ticker` (animated word swap instead of hard cut) · `scale-swap-transition` (visual morph between entries).

## Selected motion rule: kinetic-beat-slam

---
name: kinetic-beat-slam
description: Percussive kinetic typography — short phrases slam in on a steady beat with distinct per-phrase entrances, optional rhythm chrome (metronome ticks, beat bar), then a locked finale.
metadata:
  tags: text, kinetic, typography, beat, rhythm, slam, percussive, punchy
---

# Kinetic Beat Slam

Short phrases hit one at a time on a **steady beat**, each with a _different_ entrance, then stack into a locked finale — the recipe for "punchy / rhythmic" text-forward pieces (taglines, manifestos, hype intros). The difference between generic and rhythmic is (1) one shared **onset array** driving every element, (2) **distinct** entrances per phrase rather than one reused helper, and (3) optional **rhythm chrome** that visibly keeps the beat.

## How It Works

A single tempo grid — `PULSE` seconds per sub-beat, `BEATS = [t0, t1, t2, …]` on that grid — is the rhythmic spine; every phrase entrance, accent, and chrome tick reads its time from it, so the piece locks to one pulse instead of drifting hand-tuned offsets. Each phrase gets a different transform axis (scale+blur slam / side snap / rise+rotate) with short attacks (0.35–0.6s on the hit), then the stack holds with a finite low-amplitude breath.

## Recipe

```html
<!-- inside a standard scene clip (hyperframes-core) -->
<div class="kbs-stage">
  <div class="kbs-line" id="p1"><span class="verb">Notice</span> more.</div>
  <div class="kbs-line" id="p2"><span class="verb">Decide</span> faster.</div>
  <div class="kbs-line" id="p3"><span class="verb">Act</span> now.</div>
</div>
<!-- optional rhythm chrome -->
<div class="kbs-metronome" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
```

```css
.kbs-stage {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 120px 160px; /* title-safe margin */
}
.kbs-line {
  font-family: "Archivo Black", "League Gothic", sans-serif; /* embedded display face */
  font-size: 150px;
  line-height: 0.96;
  letter-spacing: -0.03em;
  color: #f5f5f5;
}
.kbs-line .verb {
  color: #ff5b2e; /* exactly one accent hue */
}
.kbs-metronome {
  position: absolute;
  bottom: 64px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 14px;
}
.kbs-metronome i {
  width: 6px;
  height: 28px;
  background: #ff5b2e;
  opacity: 0.25;
}
```

```js
// ONE tempo grid drives everything — phrases AND the metronome read it.
const PULSE = 0.4; // seconds per sub-beat
const BEATS = [PULSE * 1, PULSE * 5, PULSE * 9]; // phrase onsets, on the grid

// Distinct entrances per phrase (NOT one reused helper).
tl.fromTo(
  "#p1",
  { scale: 1.5, filter: "blur(16px)", opacity: 0 },
  { scale: 1, filter: "blur(0px)", opacity: 1, duration: 0.5, ease: "power4.out" },
  BEATS[0],
);
tl.fromTo(
  "#p2",
  { x: -320, opacity: 0 },
  { x: 0, opacity: 1, duration: 0.45, ease: "expo.out" },
  BEATS[1],
);
tl.fromTo(
  "#p3",
  { y: 90, rotation: 6, opacity: 0 },
  { y: 0, rotation: 0, opacity: 1, duration: 0.55, ease: "circ.out" },
  BEATS[2],
);

// Rhythm chrome: each tick flashes on the SAME grid, not a magic offset.
gsap.utils.toArray(".kbs-metronome i").forEach((tick, i) => {
  tl.to(tick, { opacity: 1, duration: 0.08, yoyo: true, repeat: 1, ease: "none" }, PULSE * (i + 1));
});

// Finale hold: floor (not ceil) so the repeat never overshoots data-duration;
// max(0,…) so a short hold never yields a negative repeat (GSAP reads negative as -1 = infinite).
const holdStart = BEATS[2] + 0.7,
  cycle = 1.6,
  holdDur = SCENE_DURATION - holdStart;
tl.to(
  ".kbs-stage",
  {
    scale: 1.01,
    duration: cycle / 2,
    ease: "sine.inOut",
    yoyo: true,
    repeat: Math.max(0, Math.floor(holdDur / cycle) - 1),
  },
  holdStart,
);
```

## Variations

- **Entrance easing by attack character** — `power4.out` hard slam ⭐ default hit · `expo.out` hardest snap (side-snaps, whip-ins) · `back.out(2)` overshoot pop (accents only, not body words) · `circ.out` heavy rise with momentum. Use **at least 3 distinct easings** across the piece.
- **Rhythm chrome alternatives** — a center beat bar or a `// label` monospace tag pulsing on-beat instead of the 5-tick metronome; mark any decorative that must survive a shader transition per `../../transitions/overview.md`.
- **Finale dressing** — stack + accent underline sweep ([css-marker-patterns](css-marker-patterns.md)); don't just leave the last phrase sitting.

## Values

| token             | range                | notes                                                                                        |
| ----------------- | -------------------- | -------------------------------------------------------------------------------------------- |
| BEATS spacing     | 1.2–1.8s             | <0.8s frantic, >2.5s loses the pulse; keep spacing even — it's a beat                        |
| entrance duration | 0.35–0.6s            | the hit must resolve before the next beat; exits ≤0.25s                                      |
| accent hue        | exactly 1            | the verbs; the rest mono white / near-black                                                  |
| display face      | 150px+, heavy weight | Archivo Black / League Gothic / Oswald — see `hyperframes-creative/references/typography.md` |

## Critical Constraints

- **One beat array, not scattered offsets** — every element times off `BEATS[]` / `PULSE`; this is the single biggest lever for "rhythmic".
- **Different entrance per phrase** — a reused `punchIn()` for all lines is the flat-but-competent tell. Vary the motion axis, reuse the ease _family_.
- **Finale repeat math**: `repeat: Math.max(0, Math.floor(dur / cycle) - 1)` — `Math.ceil` overshoots `data-duration` and trips the `gsap_repeat_ceil_overshoot` lint rule; a negative repeat is read by GSAP as `-1` (infinite).
- **No banned exit animations between scenes** — in a montage the _transition_ is the exit (`../../transitions/overview.md`); only a final scene may fade out.
- **Display font must be embedded** or it silently falls back at render — Anton / Bebas-as-literal are NOT embedded (`Bebas Neue` aliases to League Gothic; verify in `typography.md`).

## See also

`3d-text-depth-layers` (extruded depth on the slammed words) · `css-marker-patterns` (finale underline/circle) · `sine-wave-loop` (the finale breath) · `../adapters/gsap-easing-and-stagger.md` (easing vocabulary).

## Selected motion rule: svg-path-draw

---
name: svg-path-draw
description: Animate SVG paths drawing progressively using stroke-dasharray and stroke-dashoffset.
metadata:
  tags: svg, stroke, draw, path, reveal, icon, vector
---

# SVG Path Draw

Reveals an SVG shape by animating its stroke as if a pen were tracing it. Two stroke properties together: **`stroke-dasharray = <pathLength>`** makes the entire path one dash; **`stroke-dashoffset`** starts at the path length (dash shifted fully out of view → invisible) and tweens to `0` (fully drawn). The length comes from the DOM API `path.getTotalLength()` — measured, never guessed.

Works on anything with a stroke: `<path>`, `<circle>`, `<rect>`, `<line>`, `<polyline>`, `<polygon>`, `<ellipse>`.

## Recipe

```html
<!-- inside a standard scene clip -->
<svg class="logo-mark" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <path id="bar-left" d="M 60 40 L 60 160" />
  <path id="bar-right" d="M 140 40 L 140 160" />
  <path id="bar-mid" d="M 60 100 L 140 100" />
</svg>
```

```css
.logo-mark path {
  fill: none; /* outline-only draw — a fill would appear immediately and ruin the reveal */
  stroke: {accentColor};
  stroke-width: 12;
  stroke-linecap: round; /* softer endpoints */
  stroke-linejoin: round;
}
```

```js
// Setup: measure each path and set its dash pattern. Real measured geometry, not a magic number.
document.querySelectorAll(".logo-mark path").forEach((p) => {
  const len = p.getTotalLength();
  p.style.strokeDasharray = `${len}`;
  p.style.strokeDashoffset = `${len}`;
});

// Stagger draws so the eye reads continuous motion — each segment starts at
// ~70-80% of the previous segment's duration, before it finishes.
tl.to(
  "#bar-left",
  { strokeDashoffset: 0, duration: SEGMENT_DRAW_DUR, ease: "power2.out" },
  SEG_1_START,
);
tl.to(
  "#bar-right",
  { strokeDashoffset: 0, duration: SEGMENT_DRAW_DUR, ease: "power2.out" },
  SEG_2_START,
);
tl.to(
  "#bar-mid",
  { strokeDashoffset: 0, duration: FINAL_SEGMENT_DUR, ease: "power2.out" },
  SEG_3_START,
);

// Companion wordmark fades in only after the last stroke settles.
tl.to(
  ".brand-line",
  { opacity: 1, duration: BRAND_FADE_DUR, ease: "power1.out" },
  BRAND_FADE_START,
);
```

## Variations

- **Ring starting at 12 o'clock** — `<circle>` / `<rect>` strokes start at 3 o'clock by default; rotate the element `-90deg` so a progress ring draws from the top:

```html
<circle
  cx="100"
  cy="100"
  r="60"
  id="ring"
  style="transform-origin: 100px 100px; transform: rotate(-90deg)"
/>
```

- **Linear (constant-speed) draw** — `ease: "none"` for a steady-rate "real pen" trace.
- **Draw then fill** — for filled shapes, tween `fillOpacity: 0 → 1` AFTER the stroke completes (requires `fill-opacity: 0` initially and a real `fill` in CSS):

```js
tl.to(
  "#path",
  { strokeDashoffset: 0, duration: SEGMENT_DRAW_DUR, ease: "power2.out" },
  SEG_1_START,
);
tl.to(
  "#path",
  { fillOpacity: 1, duration: FILL_FADE_DUR, ease: "power1.out" },
  SEG_1_START + SEGMENT_DRAW_DUR,
);
```

## Values

| token             | range                                   | notes                                                                                              |
| ----------------- | --------------------------------------- | -------------------------------------------------------------------------------------------------- |
| SEGMENT_DRAW_DUR  | 0.3–0.8s                                | fast snap vs deliberate pen trace; >~1s feels sluggish for a logo reveal                           |
| FINAL_SEGMENT_DUR | 60–80% of SEGMENT_DRAW_DUR              | proportional to segment length — a short connector at full duration reads slower than its siblings |
| SEG_N_START       | previous start + 70–80% of its duration | reads as continuous motion, not N isolated animations                                              |
| SEG_1_START       | 0–0.4s                                  | a small ~0.2s lead-in lets the viewer settle before motion                                         |
| BRAND_FADE_START  | ≥ last stroke end (+ ~0.2s beat)        | earlier and the wordmark competes with the draw                                                    |
| BRAND_FADE_DUR    | 0.3–0.8s                                | snap (urgent) vs glide (premium)                                                                   |

Ease families are discrete choices: **stroke draws** use `power2.out` (a hand lifting at end of stroke) or `none` for constant speed — never `back.out` / `elastic.out` (pens don't bounce). **Fades** use `power1.out`.

## Critical Constraints

- **`fill: none`** for outline-only draws — otherwise the fill appears immediately.
- **Dasharray/dashoffset = the measured `getTotalLength()`**, set at setup; requires the SVG in the DOM (inline SVG is fine; a loaded `<image>` SVG is not).
- **Complex paths**: if `getTotalLength()` looks wrong, overestimate slightly (`len * 1.05`) — too large is invisible at animation start; too small clips the end.
- **Stagger multi-path draws at ~70–80%** of the previous segment's duration.
- **A drawn line must land on something.** When the path is a connector (rail, beam, underline, callout) rather than a shape, both endpoints must sit on real elements and the draw must do a job — reveal, route, validate, or emphasize. A stroke that only decorates empty space reads as filler; attach it or cut it.

## See also

`svg-icon-enrichment` (internal parts animate after the outline draws) · `counting-dynamic-scale` (stroke draws an icon while a number counts up) · `hacker-flip-3d` (logo draws, wordmark decodes beneath).
