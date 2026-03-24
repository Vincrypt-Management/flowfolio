# Backtest Educational Reel — Design Spec

**Date:** 2026-03-24
**Series:** FlowFolio Instagram Educational Reels
**Follows:** SecurityEducational031 (privacy/vault), QuantCarousel032 (5 quant metrics)

---

## Overview

A ~55-second narrated Instagram Reel that teaches retail investors what backtesting is, why it matters, and how FlowFolio makes it accessible. Bridges directly from the QuantCarousel032 ("here are the 5 numbers") to a practical demonstration ("here is where those numbers come from").

**Emotional arc:** Fear of loss → Understanding → Empowerment → CTA

---

## Numbering Convention

The suffix number is **content-type-scoped per app version**, not strictly sequential across all content. `031` = v0.3.1 release content. `032` = v0.3.2 content. `SecurityCarousel031` and `SecurityEducational031` coexist because they have distinct full IDs. `QuantCarousel032` and `BacktestEducational032` are likewise distinct IDs — no collision.

---

## Composition

| Field | Value |
|---|---|
| Composition ID | `BacktestEducational032` |
| Component file | `src/remotion/FlowFolioBacktestEducational032.tsx` |
| VO script | `src/remotion/scripts/generate-vo-backtest032.mjs` |
| Post script | `scripts/instagram/post-backtest-educational-032.ts` |
| Audio dir | `public/audio/vo/backtest032/` |
| Output file | `out/flowfolio-backtest-educational-032.mp4` |
| Dimensions | 1080 × 1920 (portrait) |
| FPS | 60 |
| Default duration | 3300 frames (~55s, overridden by calculateMetadata) |
| Voice | en-US-AndrewNeural @ -5% rate |

---

## Scenes

### Scene 1 — hook
**Visual:** Warning triangle icon (`alert-tri`, rose/amber gradient), centered. Two-line headline animates up.
- Line 1: "Running a strategy blind"
- Line 2 (accent): "is how you lose money."
**VO:** *"Most investors test strategies the expensive way — by losing real money on them."*
**Estimated duration:** ~5s (300 frames)

### Scene 2 — problem
**Visual:** Split composition. Left: a calendar visual (date range label). Right: a chart line that peaks then drops sharply with a red drawdown zone shaded. Text overlay: "40% drawdown. Hidden in 2020."
**VO:** *"A strategy that worked for three months might have a forty percent drawdown hiding in 2020. You won't find that out by watching. You find it by backtesting."*
**Estimated duration:** ~9s (540 frames)

### Scene 3 — howto
**Visual:** Four numbered step pills animate in sequentially:
1. Pick symbols — icon: `search` (magnifying glass)
2. Set date range — icon: `calendar`
3. Choose strategy — icon: `sliders` (strategy/vibe)
4. Run backtest — icon: `play`
Below: subtle animated progress bar.
**VO:** *"In FlowFolio, a backtest takes four steps. Pick your symbols, set your date range, choose your vibe strategy, and run. The engine pulls historical data from eight providers and simulates every trade."*
**Estimated duration:** ~11s (660 frames)

### Scene 4 — results
**Visual:** Five metric cards animate in one by one with staggered delay:
- Sharpe Ratio (primary green, `#00e599`)
- Max Drawdown (rose, `#fb7185`)
- Sortino Ratio (accent purple, `#818cf8`)
- Beta (blue, `#38bdf8`)
- Profit Factor (amber)
Each card shows the metric name, a placeholder value, and a "good/bad" indicator dot.
**VO:** *"The results give you the five numbers that matter — Sharpe ratio, max drawdown, Sortino, beta, and profit factor. You saw these in the last post. Now you know where they come from."*
**Estimated duration:** ~10s (600 frames)

### Scene 5 — verdict
**Visual:** Side-by-side comparison panel:
- Left (green border): "Good Backtest" — Sharpe > 1.0, Drawdown < 20%, Profit Factor > 1.5
- Right (red border): "Back to the drawing board" — Sharpe 0.4, Drawdown 41%, Profit Factor 0.9
A verdict badge ("Worth risking real money" vs "Not yet") fades in below each column.
**VO:** *"A Sharpe above one, drawdown under twenty percent, profit factor above one-point-five — that's a strategy worth risking real money on. Anything else goes back to the drawing board."*
**Estimated duration:** ~11s (660 frames)

### Scene 6 — cta
**Visual:** Logo scale-in, FlowFolio wordmark, three feature pills animating in:
- Backtest any strategy
- 8 market data providers
- 100% offline
Download prompt fades in last.
**VO:** *"FlowFolio. Backtest before you invest. One hundred percent offline. Free."*
**Estimated duration:** ~6s (360 frames)

---

## Icon SVG Paths

The component defines a `PATHS` record. Required paths not present in `SecurityEducational031`:

```ts
const PATHS: Record<string, string> = {
  // Reused from SecurityEducational031:
  'alert-tri': 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4m0 4h.01',
  lock:        'M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2zM7 11V7a5 5 0 0110 0v4',
  check:       'M22 11.08V12a10 10 0 11-5.93-9.14M22 4L12 14.01l-3-3',
  // New for this composition:
  search:      'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  calendar:    'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
  sliders:     'M4 6h16M8 6V4m0 4v2M16 12H4m12-2v2m0 0v2M4 18h16m-4-2v2m0 0v2',
  play:        'M5 3l14 9-14 9V3z',
  trending:    'M22 7l-8.5 8.5-5-5L2 17M22 7h-6m6 0v6',
};
```

---

## Audio-Driven Timing

Timing is computed at render time via `calculateMetadata` in `Root.tsx` using `getAudioDurationInSeconds`. The `generate-vo-backtest032.mjs` script generates one WAV per scene segment ID. The component accepts a `voSegments` prop (same `VoSegment` interface exported from `FlowFolioSecurityEducational031.tsx`).

**Cursor advance rule:** cursor advances by `audioDur + GAP` (not `visualDur + GAP`), identical to `computeSec031Segments` in `Root.tsx`. This means `visualDur` (= `audioDur + OVERLAP`) slightly overlaps the gap — intentional for smooth scene transitions.

Fallback timings (used before audio is generated):

| ID | startFrame | audioDur | visualDur |
|---|---|---|---|
| hook | 0 | 300 | 310 |
| problem | 320 | 540 | 550 |
| howto | 880 | 660 | 670 |
| results | 1560 | 600 | 610 |
| verdict | 2180 | 660 | 670 |
| cta | 2860 | 360 | 390 |

Gap between segments: 20 frames. Last segment visualDur = audioDur + 30 (trailing buffer). Total fallback: ~3250 frames.

---

## Root.tsx Entry

Add immediately after the existing `computeSec031Segments` helper:

```ts
const BT032_IDS = ['hook', 'problem', 'howto', 'results', 'verdict', 'cta'] as const;
const BT032_GAP = 20;
const BT032_OVERLAP = 10;
const BT032_FPS = 60;

async function computeBt032Segments(): Promise<{ segments: VoSegment[]; totalFrames: number }> {
  const segments: VoSegment[] = [];
  let cursor = 0;
  const ids = BT032_IDS;
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const secs = await getAudioDurationInSeconds(staticFile(`audio/vo/backtest032/${id}.wav`));
    const audioDur = Math.ceil(secs * BT032_FPS);
    const isLast = i === ids.length - 1;
    const visualDur = audioDur + (isLast ? 30 : BT032_OVERLAP);
    segments.push({ id, startFrame: cursor, audioDur, visualDur });
    cursor += audioDur + BT032_GAP;
  }
  const last = segments[segments.length - 1];
  const totalFrames = last.startFrame + last.visualDur;
  return { segments, totalFrames };
}
```

Add composition to `Root.tsx` JSX (after SecurityEducational031):

```tsx
import { BacktestEducational032 } from './FlowFolioBacktestEducational032';

<Composition
  id="BacktestEducational032"
  component={BacktestEducational032}
  durationInFrames={3300}
  fps={60}
  width={1080}
  height={1920}
  defaultProps={{ seed: defaultSeed, voSegments: undefined }}
  calculateMetadata={async ({ props }) => {
    try {
      const { segments, totalFrames } = await computeBt032Segments();
      return { durationInFrames: totalFrames, props: { ...props, voSegments: segments } };
    } catch {
      return {};
    }
  }}
/>
```

---

## Visual Design Language

Matches `FlowFolioSecurityEducational031.tsx` exactly:
- Background: `colors.bg` (`#060608`) with animated ambient gradient blobs
- Typography: `fonts.sans` (headings), `fonts.mono` (metrics/labels)
- Glass cards: `rgba(12,12,16,0.7)` with `backdrop-filter: blur(16px)`
- Animations: `fadeUp`, `fadeIn`, `spring` — same helpers as security reel
- Dot grid pattern overlay at 2% opacity
- Accent colors per scene: rose (hook), amber (problem), primary green (howto), mixed (results), split green/rose (verdict), primary green (cta)

---

## Ambient Audio

Same `AudioTrack` synth engine as security reel: `buildIntroAudio(totalDuration, seed)` at 0.15 volume, ducked under VO, 60-frame fade in/out.

---

## VO Generation Script

`src/remotion/scripts/generate-vo-backtest032.mjs`

- Voice: `en-US-AndrewNeural`
- Rate: `-5%`
- Binary path: `/Users/evintleovonzko/Library/Python/3.9/bin/edge-tts` (same hardcoded path as `generate-vo-security031.mjs` — update if Python version differs)
- Output: `public/audio/vo/backtest032/{id}.wav`
- Converts mp3 → wav via `afconvert -f WAVE -d LEI16@48000`
- Does NOT include `startFrame` or `durationInFrames` in segment objects — timing is measured at render time via `calculateMetadata`
- **Warning:** Do NOT use `generate-vo-security031.mjs` as a copy-paste template. That script includes `startFrame`/`durationInFrames` per segment (legacy fields, now unused). The `backtest032` script intentionally omits them.

Segment object shape (no frame timing):
```js
const segments = [
  { id: 'hook',    text: '...' },
  { id: 'problem', text: '...' },
  { id: 'howto',   text: '...' },
  { id: 'results', text: '...' },
  { id: 'verdict', text: '...' },
  { id: 'cta',     text: '...' },
];
```

---

## Post Script

`scripts/instagram/post-backtest-educational-032.ts`

- Checks `out/flowfolio-backtest-educational-032.mp4` exists
- Logs in via `auth.ts`, uploads via `uploadReel` with `addTrendingAudio: false`
- Caption: hook-first, lowercase tone (matching quant carousel style), 20 hashtags

### Caption

```
most investors find out their strategy doesn't work the same way — by watching their account drop

a strategy that looked great on paper can have a 40% drawdown hiding in 2020. you won't know until it happens again. unless you backtest first.

here's what backtesting actually tells you:

→ sharpe ratio — are you being paid for the risk you're taking?
→ max drawdown — what's the worst you'd have had to sit through?
→ sortino ratio — how bad is the downside volatility specifically?
→ beta — how much of this is just the market moving?
→ profit factor — do your winners actually outweigh your losers?

FlowFolio runs this simulation automatically. pick your symbols, set your date range, choose your strategy, and run. eight market data providers. historical data going back years. all on your machine.

if it doesn't pass the five-number test, it doesn't get real money.

link in bio.

—

#backtesting #quanttrading #investingsmart #portfoliomanagement #riskmanagement #sharperatio #stockmarket #retailinvesting #tradingstrategy #financialeducation #personalfinance #stocktrading #wealthbuilding #fintech #indieapp #buildingpublicly #passiveincome #investingforbeginners #portfoliooptimization #factorinvesting
```

---

## package.json Render Script

Add to the `scripts` block:

```json
"remotion:render:backtest032": "npx remotion render src/remotion/index.ts BacktestEducational032 out/flowfolio-backtest-educational-032.mp4"
```

---

## Implementation Checklist

- [ ] `src/remotion/FlowFolioBacktestEducational032.tsx` — 6-scene composition (mirrors SecurityEducational031 structure)
- [ ] `src/remotion/scripts/generate-vo-backtest032.mjs` — TTS generation script (no frame timing in segment objects)
- [ ] `src/remotion/Root.tsx` — add `import { BacktestEducational032 }`, add `computeBt032Segments` helper, add Composition with `calculateMetadata`
- [ ] `scripts/instagram/post-backtest-educational-032.ts` — Instagram post script
- [ ] `package.json` — add `remotion:render:backtest032` script (exact command above)
- [ ] Generate audio: `node src/remotion/scripts/generate-vo-backtest032.mjs`
- [ ] Render video: `npm run remotion:render:backtest032`
- [ ] Post: `npx tsx scripts/instagram/post-backtest-educational-032.ts`
