# FlowFolio Instagram Renderer — Design Spec
**Date:** 2026-03-15
**Status:** Approved for implementation

---

## Overview

Replace the Remotion-based Instagram content generation pipeline with a lightweight HTML/CSS → Playwright → ffmpeg pipeline. The new system renders each post type from a branded HTML template using Playwright's headless Chromium, producing pixel-perfect 1080×1080 PNGs for feed posts and carousels. The visual direction is **Style B — Rich Data Card**: dark background, grid overlay, KPI chips, accent bars, real `logo.png` in the footer.

---

## Scope

### Posts to generate immediately
All 9 upcoming scheduled posts (March 17 – March 27):

| Date | Type | Topic |
|------|------|-------|
| Mar 17 | feed-feature | Portfolio Optimization / Efficient Frontier |
| Mar 18 | feed-feature | Build in public / engineer story |
| Mar 19 | carousel (8 slides) | Financial literacy — no jargon |
| Mar 20 | feed-metrics | Quant concepts that matter |
| Mar 23 | carousel (8 slides) | Financial literacy — gatekeeping |
| Mar 24 | feed-metrics | Privacy-first investing |
| Mar 25 | carousel (8 slides) | Investing education |
| Mar 26 | feed-metrics | Diversification / rebalancing |
| Mar 27 | carousel (8 slides) | 8 key concepts condensed |

### Out of scope
- Animated video reels (existing release reel already posted)
- Modifying `upload.ts`, `scheduler.ts` (unchanged)
- Changes to the schedule DB schema

---

## Architecture

```
scripts/instagram/
├── templates/                  NEW: HTML templates (one per post type)
│   ├── feed-feature.html
│   ├── feed-metrics.html
│   └── carousel-slide.html
├── render/                     NEW: Playwright renderer
│   ├── renderer.ts             Core: HTML → PNG via Playwright
│   ├── content-parser.ts       Extract structured tokens from caption text
│   └── generate.ts             Entry point: read DB → render → save → update DB
└── content-generator.ts        MODIFIED: renderContent() becomes async, calls generatePost()
```

---

## Templates

Each template is a self-contained HTML file with `{{TOKEN}}` placeholders replaced by the renderer before loading. All templates share the token `{{LOGO_B64}}` (base64 PNG) injected by the renderer — not by the content parser.

### Shared design tokens
```
Background:   #060608
Card bg:      rgba(255,255,255,0.025)
Border:       rgba(255,255,255,0.06)
Grid lines:   rgba(255,255,255,0.018) / 36px
Primary:      #00e599   Accent: #818cf8   Blue: #38bdf8   Rose: #fb7185
Text:         #f8fafc   Muted: #94a3b8    Dim: #64748b
Font sans:    Inter 700–900 (headlines), 500 (body)
Font mono:    JetBrains Mono 600 (labels, KPIs, tags)
```

Fonts are loaded from Google Fonts CDN via `@import` in the template `<head>`. This is a known exception to the project's offline-first principle — acceptable for a build-time render script (not the app itself). If CDN is unreachable, the renderer catches the timeout and fails fast (see Error Handling).

### `feed-feature.html` tokens
| Token | Description |
|-------|-------------|
| `{{LOGO_B64}}` | base64 PNG of public/logo.png (injected by renderer) |
| `{{PILL}}` | Green pill label, e.g. "Portfolio Optimization" |
| `{{VERSION}}` | Version tag, e.g. "FlowFolio v0.2.2" |
| `{{HEADLINE}}` | First line of headline (≤ 52 chars) |
| `{{HEADLINE_2}}` | Second line of headline (≤ 52 chars, may be empty) |
| `{{HEADLINE_ACCENT}}` | Substring of headline to render in green |
| `{{KPI_1_VAL}}` `{{KPI_1_LBL}}` `{{KPI_1_COLOR}}` | KPI chip 1 |
| `{{KPI_2_VAL}}` `{{KPI_2_LBL}}` `{{KPI_2_COLOR}}` | KPI chip 2 |
| `{{KPI_3_VAL}}` `{{KPI_3_LBL}}` `{{KPI_3_COLOR}}` | KPI chip 3 |
| `{{BAR_1_LABEL}}` `{{BAR_1_PCT}}` `{{BAR_1_COLOR}}` | Bar row 1 |
| `{{BAR_2_LABEL}}` `{{BAR_2_PCT}}` `{{BAR_2_COLOR}}` | Bar row 2 |
| `{{BAR_3_LABEL}}` `{{BAR_3_PCT}}` `{{BAR_3_COLOR}}` | Bar row 3 |
| `{{BAR_4_LABEL}}` `{{BAR_4_PCT}}` `{{BAR_4_COLOR}}` | Bar row 4 |

Layout: header row (pill + version) → headline → data card (KPIs + bars) → footer (logo + wordmark left, "link in bio →" right). Background: dot-grid + two radial glows.

### `feed-metrics.html` tokens
| Token | Description |
|-------|-------------|
| `{{LOGO_B64}}` | base64 PNG |
| `{{PILL}}` | Green pill label |
| `{{VERSION}}` | Version tag |
| `{{HEADLINE}}` `{{HEADLINE_2}}` | Headline lines |
| `{{HEADLINE_ACCENT}}` | Green-highlighted word |
| `{{STAT_1_VAL}}` `{{STAT_1_LBL}}` | Stat cell 1 (green) |
| `{{STAT_2_VAL}}` `{{STAT_2_LBL}}` | Stat cell 2 (accent) |
| `{{STAT_3_VAL}}` `{{STAT_3_LBL}}` | Stat cell 3 (blue) |
| `{{STAT_4_VAL}}` `{{STAT_4_LBL}}` | Stat cell 4 (green) |
| `{{QUOTE}}` | Pull-quote text in green italic block |

Layout: header → headline → 2×2 stat grid → quote block → footer.

### `carousel-slide.html` tokens
| Token | Description |
|-------|-------------|
| `{{LOGO_B64}}` | base64 PNG |
| `{{PILL}}` | Pill label |
| `{{SLIDE_TYPE}}` | `cover` \| `content` \| `cta` — controls which layout renders |
| `{{SLIDE_N}}` | Current slide number, 1-based |
| `{{SLIDE_TOTAL}}` | Total slide count |
| `{{HEADLINE}}` `{{HEADLINE_2}}` | Used on cover + content slides |
| `{{CONCEPT}}` | Bold concept title on content slides |
| `{{BODY}}` | Body text on content slides (3–4 sentences, HTML-escaped) |
| `{{STAT}}` | Optional accent stat chip on content slides (empty string = hidden) |
| `{{CTA_HANDLE}}` | CTA slide: Instagram handle, e.g. "@flowfolio" |
| `{{CTA_LINE}}` | CTA slide: primary CTA text, e.g. "Download — link in bio" |
| `{{CTA_SUB}}` | CTA slide: secondary line, e.g. "Privacy-first · Free · macOS/Windows/Linux" |

**Slide structure:** Every carousel has exactly 8 slides: 1 cover + 6 content + 1 CTA. If `parsePost` extracts fewer than 6 content concepts from the caption, the remaining content slots are filled with thematically relevant placeholder content from the `TOPIC_DATA` map for that composition. The slide count is always 8 — `slide-00.png` through `slide-07.png` — matching what `upload.ts` expects from directory-based carousels.

---

## Renderer (`renderer.ts`)

```typescript
interface RenderOptions {
  templatePath: string;
  tokens: Record<string, string>;
  outputPath: string;
  width?: number;   // default 1080
  height?: number;  // default 1080
}

// Caller manages browser lifetime. renderer manages pages.
async function renderPost(browser: Browser, opts: RenderOptions): Promise<void>
```

**Steps:**
1. Read logo: at module load, `fs.readFileSync('public/logo.png')` → base64. Fail fast with a clear error message if the file is missing — do not proceed with a broken logo token.
2. Read template HTML, replace all `{{TOKEN}}` occurrences with `tokens` values plus `LOGO_B64`.
3. Open a new Playwright page on the shared `browser`.
4. Set viewport `width × height`, `deviceScaleFactor: 1`.
5. `page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 })`.
6. `page.screenshot({ path: outputPath, type: 'png' })`.
7. Close page. Browser stays open for the batch.

**Error handling in `renderPost`:**
```
try {
  // steps 3–7
} catch (err) {
  await page.close().catch(() => {});   // always close the page
  throw err;                            // propagate to generate.ts
}
```

---

## Content Parser (`content-parser.ts`)

```typescript
function parsePost(composition: string, caption: string, seed: number): Record<string, string>
```

Returns the full token map for a post (excluding `LOGO_B64`, which the renderer injects).

**Topic detection:** A `TOPIC_KEY` is derived by keyword matching on the caption:
- "efficient frontier" / "optimization" / "optimal" → `portfolio-optimization`
- "build" / "engineer" / "built" / "weekend project" → `build-in-public`
- "quant" / "concepts" / "building block" → `quant-concepts`
- "privacy" / "spy" / "offline" / "cannot" → `privacy-first`
- "rebalanc" / "drift" / "optimizer" → `rebalancing`
- "financial literacy" / "gatekeep" / "jargon" → `financial-literacy`
- "200 hours" / "condensed" / "8 slides" → `investing-education`
- Default: `general`

**`TOPIC_DATA` map:** Pre-defined display values per topic key, covering all current post themes. Seeds drive minor numeric variation (±2–5% jitter on percentages, ±0.1 on Sharpe ratios) so repeated topic posts look slightly different. Headline + pill are also defined per topic.

**Carousel content:** Caption is split into sentences. Sentences containing a dash-list item, number, or ":" are candidates for content slides. If fewer than 6 candidates exist, slots are filled from `TOPIC_DATA[topicKey].carouselFallbackSlides`.

---

## Entry Point (`generate.ts`)

**Exported API (used by `content-generator.ts`):**
```typescript
export async function generatePost(postId: string): Promise<{ videoPath: string }>
```

**CLI flags:**
| Flag | DB query |
|------|----------|
| `--post-id <id>` | Single post by ID |
| `--upcoming` | `getUpcomingPosts()` — pending + rendering + rendered, ordered by date |
| `--all-pending` | `getPendingPosts(new Date().toISOString())` — overdue pending only |
| _(no flag)_ | Same as `--upcoming` |

**Flow for each post:**
1. `updatePostStatus(db, id, 'rendering')` — mark in-progress before starting
2. Call `parsePost()` → tokens
3. Call `renderPost()` for each output file
4. `updatePostStatus(db, id, 'rendered', { video_path })` — success
5. On any error: `updatePostStatus(db, id, 'failed', { error: err.message })`, log, continue with next post

**Re-render behaviour:** Output files are overwritten unconditionally. This is intentional — re-running `generate.ts` for an already-rendered post regenerates the image (useful for style updates). The DB `video_path` is updated to the new path.

---

## `content-generator.ts` Changes

`renderContent()` currently calls `execSync` to shell out to Remotion. It becomes `async` and calls `generatePost()` instead:

```typescript
// Before (sync, Remotion):
// execSync(`npx remotion render ...`)

// After (async, Playwright renderer):
import { generatePost } from './render/generate.js';
async function renderContent(postId: string): Promise<string> {
  const { videoPath } = await generatePost(postId);
  return videoPath;
}
```

All callers of `renderContent()` in `content-generator.ts` must be updated to `await` it. Since `content-generator.ts` is only called from `scheduler.ts` (which already uses async/await), this is a non-breaking change to external callers.

---

## File Outputs

| Composition | Output |
|-------------|--------|
| `feed-feature` | `out/scheduled/feed-feature-<seed>.png` |
| `feed-metrics` | `out/scheduled/feed-metrics-<seed>.png` |
| `carousel` | `out/scheduled/carousel-<seed>/slide-00.png … slide-07.png` |

Same directory and naming conventions as existing Remotion output — `upload.ts` and `scheduler.ts` require no changes.

---

## Dependencies

No new npm packages. Uses only:
- `playwright` — already installed
- `better-sqlite3` — already installed
- `fs`, `path` — Node built-ins
- Google Fonts CDN — Inter + JetBrains Mono (render-time network call; acceptable for a CLI tool)

---

## Quality Targets

- Output: true 1080×1080 PNG, sRGB, ≤ 500 KB per image
- Fonts rendered: Inter 900 + JetBrains Mono 600, confirmed by `networkidle` wait
- Render time: < 5s per image (single browser, fonts warm after slide 1)
- No audio output

---

## What Is Not Changing

- `upload.ts` — unchanged
- `scheduler.ts` — unchanged
- `post-release.ts` — out of scope for this feature. The file has an unrelated modification (OUTPUT_FILE path changed to the audio-stripped release reel from a prior session); that change is unaffected by this work.
- Schedule DB schema — unchanged
- Caption/hashtag pools in `content-generator.ts` — unchanged
- Remotion compositions — left in place, not deleted
