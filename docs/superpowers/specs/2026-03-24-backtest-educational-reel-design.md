# Backtest Educational Reel — Design Spec

**Date:** 2026-03-24
**Series:** FlowFolio Instagram Educational Reels
**Follows:** SecurityEducational031 (privacy/vault), QuantCarousel032 (5 quant metrics)

---

## Overview

A ~55-second narrated Instagram Reel that teaches retail investors what backtesting is, why it matters, and how FlowFolio makes it accessible. Bridges directly from the QuantCarousel032 ("here are the 5 numbers") to a practical demonstration ("here is where those numbers come from").

**Emotional arc:** Fear of loss → Understanding → Empowerment → CTA

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
**Visual:** Warning triangle icon (rose/amber gradient), centered. Two-line headline animates up.
- Line 1: "Running a strategy blind"
- Line 2 (accent): "is how you lose money."
**VO:** *"Most investors test strategies the expensive way — by losing real money on them."*
**Estimated duration:** ~5s (300 frames)

### Scene 2 — problem
**Visual:** Split composition. Left: a calendar (date range). Right: a chart line that peaks then drops sharply with a red drawdown zone shaded. Text overlay: "40% drawdown. Hidden in 2020."
**VO:** *"A strategy that worked for three months might have a forty percent drawdown hiding in 2020. You won't find that out by watching. You find it by backtesting."*
**Estimated duration:** ~9s (540 frames)

### Scene 3 — howto
**Visual:** Four numbered step pills animate in sequentially:
1. Pick symbols
2. Set date range
3. Choose strategy
4. Run backtest
Below: subtle animated progress bar. Icon for each step (search, calendar, brain/vibe, play).
**VO:** *"In FlowFolio, a backtest takes four steps. Pick your symbols, set your date range, choose your vibe strategy, and run. The engine pulls historical data from eight providers and simulates every trade."*
**Estimated duration:** ~11s (660 frames)

### Scene 4 — results
**Visual:** Five metric cards animate in one by one with staggered delay:
- Sharpe Ratio (primary green)
- Max Drawdown (rose)
- Sortino Ratio (accent purple)
- Beta (blue)
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

## Audio-Driven Timing

Timing is computed at render time via `calculateMetadata` in `Root.tsx` using `getAudioDurationInSeconds`. The `generate-vo-backtest032.mjs` script generates one WAV per scene segment ID. The component accepts a `voSegments` prop (same `VoSegment` interface as `SecurityEducational031`).

Fallback timings (used before audio is generated):

| ID | startFrame | audioDur | visualDur |
|---|---|---|---|
| hook | 0 | 300 | 310 |
| problem | 320 | 540 | 550 |
| howto | 880 | 660 | 670 |
| results | 1560 | 600 | 610 |
| verdict | 2180 | 660 | 670 |
| cta | 2860 | 360 | 390 |

Gap between segments: 20 frames. Total fallback: ~3250 frames.

---

## Visual Design Language

Matches `FlowFolioSecurityEducational031.tsx` exactly:
- Background: `colors.bg` (#0a0a0f) with animated ambient gradient blobs
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
- Output: `public/audio/vo/backtest032/{id}.wav`
- Converts mp3 → wav via `afconvert -f WAVE -d LEI16@48000`
- Does NOT hardcode frame timing (timing is measured at render time)

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

#backtesting #quanttrading #investingsmart #portfoliomanagement #riskmanagement #sharperation #stockmarket #retailinvesting #tradingstrategy #financialeducation #personalfinance #stocktrading #wealthbuilding #fintech #indieapp #buildingpublicly #passiveincome #investingforbeginners #portfoliooptimization #factorInvesting
```

---

## Implementation Checklist

- [ ] `src/remotion/FlowFolioBacktestEducational032.tsx` — 6-scene composition
- [ ] `src/remotion/scripts/generate-vo-backtest032.mjs` — TTS generation script
- [ ] `src/remotion/Root.tsx` — register composition + calculateMetadata
- [ ] `scripts/instagram/post-backtest-educational-032.ts` — Instagram post script
- [ ] `package.json` — add `remotion:render:backtest032` script
- [ ] Generate audio: `node src/remotion/scripts/generate-vo-backtest032.mjs`
- [ ] Render video: `npx remotion render ... BacktestEducational032 out/flowfolio-backtest-educational-032.mp4`
- [ ] Post: `npx tsx scripts/instagram/post-backtest-educational-032.ts`
