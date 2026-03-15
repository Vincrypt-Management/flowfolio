# Playwright Instagram Renderer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Remotion-based Instagram content pipeline with HTML/CSS → Playwright → PNG rendering, generating all 9 upcoming scheduled posts (March 17–27) in FlowFolio's Rich Data Card visual style.

**Architecture:** Three self-contained HTML templates (feed-feature, feed-metrics, carousel-slide) with `{{TOKEN}}` placeholders. A Playwright renderer reads each template, injects tokens, screenshots at 1080×1080. A content parser maps caption text + composition type → token maps using a pre-defined TOPIC_DATA lookup. A generate.ts CLI drives the batch and updates the schedule DB. The existing `content-generator.ts` gets a new async `renderContentPlaywright(postId)` export; `scheduler.ts` is updated to call it with `await`.

**Tech Stack:** TypeScript/tsx, Playwright chromium (already installed), better-sqlite3 (already installed), Node fs/path, Google Fonts CDN (Inter + JetBrains Mono)

---

## Chunk 1: HTML Templates

### Task 1: Create `feed-feature.html` template

**Files:**
- Create: `scripts/instagram/templates/feed-feature.html`

- [ ] **Step 1: Create the template directory**

```bash
mkdir -p scripts/instagram/templates
```

- [ ] **Step 2: Write `feed-feature.html`**

Create `scripts/instagram/templates/feed-feature.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
  body {
    width: 1080px; height: 1080px;
    background: #060608;
    color: #f8fafc;
    font-family: 'Inter', sans-serif;
    position: relative;
    display: flex;
    flex-direction: column;
    padding: 64px;
    gap: 32px;
  }
  .grid-bg {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
    background-size: 36px 36px;
    pointer-events: none;
  }
  .glow-tl {
    position: absolute; width: 420px; height: 420px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0,229,153,0.09) 0%, transparent 70%);
    top: -120px; right: -80px; filter: blur(60px);
  }
  .glow-br {
    position: absolute; width: 320px; height: 320px; border-radius: 50%;
    background: radial-gradient(circle, rgba(129,140,248,0.07) 0%, transparent 70%);
    bottom: -80px; left: -60px; filter: blur(60px);
  }
  .row {
    display: flex; align-items: center; justify-content: space-between;
    position: relative;
  }
  .pill {
    background: rgba(0,229,153,0.12);
    border: 1px solid rgba(0,229,153,0.25);
    color: #00e599;
    font-family: 'JetBrains Mono', monospace;
    font-size: 18px; font-weight: 600;
    letter-spacing: 0.06em; padding: 8px 20px;
    border-radius: 99px; text-transform: uppercase;
  }
  .version {
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px; color: #334155; letter-spacing: 0.04em;
  }
  .headline {
    font-size: 64px; font-weight: 900;
    line-height: 1.1; letter-spacing: -0.04em;
    color: #f8fafc; position: relative;
  }
  .headline .accent { color: #00e599; }
  .data-card {
    background: rgba(255,255,255,0.025);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 24px; padding: 36px 40px;
    display: flex; flex-direction: column; gap: 28px;
    flex: 1; position: relative;
  }
  .kpi-row { display: flex; gap: 20px; }
  .kpi {
    flex: 1; background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.05);
    border-radius: 16px; padding: 20px 16px; text-align: center;
  }
  .kpi-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 36px; font-weight: 700; letter-spacing: -0.03em; line-height: 1;
  }
  .kpi-lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px; color: #64748b;
    letter-spacing: 0.06em; text-transform: uppercase; margin-top: 6px;
  }
  .bar-section { display: flex; flex-direction: column; gap: 16px; }
  .bar-item { display: flex; align-items: center; gap: 14px; }
  .bar-lbl {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px; color: #64748b; width: 110px; flex-shrink: 0;
  }
  .bar-track {
    flex: 1; height: 6px;
    background: rgba(255,255,255,0.05); border-radius: 3px; overflow: hidden;
  }
  .bar-fill { height: 100%; border-radius: 3px; }
  .bar-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 14px; color: #94a3b8; width: 44px; text-align: right;
  }
  .footer {
    display: flex; align-items: center; justify-content: space-between;
    position: relative;
  }
  .logo-mark { display: flex; align-items: center; gap: 14px; }
  .logo-img { width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(0,229,153,0.35)); }
  .logo-name { font-size: 26px; font-weight: 700; color: #f8fafc; letter-spacing: -0.03em; }
  .cta-tag {
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px; color: #00e599; letter-spacing: 0.04em;
  }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="glow-tl"></div>
  <div class="glow-br"></div>

  <div class="row">
    <div class="pill">{{PILL}}</div>
    <div class="version">{{VERSION}}</div>
  </div>

  <div class="headline">{{HEADLINE}}<br><span class="accent">{{HEADLINE_ACCENT}}</span>{{HEADLINE_2}}</div>

  <div class="data-card">
    <div class="kpi-row">
      <div class="kpi">
        <div class="kpi-val" style="color:{{KPI_1_COLOR}}">{{KPI_1_VAL}}</div>
        <div class="kpi-lbl">{{KPI_1_LBL}}</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:{{KPI_2_COLOR}}">{{KPI_2_VAL}}</div>
        <div class="kpi-lbl">{{KPI_2_LBL}}</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:{{KPI_3_COLOR}}">{{KPI_3_VAL}}</div>
        <div class="kpi-lbl">{{KPI_3_LBL}}</div>
      </div>
    </div>
    <div class="bar-section">
      <div class="bar-item">
        <span class="bar-lbl">{{BAR_1_LABEL}}</span>
        <div class="bar-track"><div class="bar-fill" style="width:{{BAR_1_PCT}}%;background:{{BAR_1_COLOR}}"></div></div>
        <span class="bar-val" style="color:{{BAR_1_COLOR}}">{{BAR_1_PCT}}%</span>
      </div>
      <div class="bar-item">
        <span class="bar-lbl">{{BAR_2_LABEL}}</span>
        <div class="bar-track"><div class="bar-fill" style="width:{{BAR_2_PCT}}%;background:{{BAR_2_COLOR}}"></div></div>
        <span class="bar-val" style="color:{{BAR_2_COLOR}}">{{BAR_2_PCT}}%</span>
      </div>
      <div class="bar-item">
        <span class="bar-lbl">{{BAR_3_LABEL}}</span>
        <div class="bar-track"><div class="bar-fill" style="width:{{BAR_3_PCT}}%;background:{{BAR_3_COLOR}}"></div></div>
        <span class="bar-val" style="color:{{BAR_3_COLOR}}">{{BAR_3_PCT}}%</span>
      </div>
      <div class="bar-item">
        <span class="bar-lbl">{{BAR_4_LABEL}}</span>
        <div class="bar-track"><div class="bar-fill" style="width:{{BAR_4_PCT}}%;background:{{BAR_4_COLOR}}"></div></div>
        <span class="bar-val" style="color:{{BAR_4_COLOR}}">{{BAR_4_PCT}}%</span>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="logo-mark">
      <img class="logo-img" src="data:image/png;base64,{{LOGO_B64}}" alt="FlowFolio">
      <span class="logo-name">FlowFolio</span>
    </div>
    <span class="cta-tag">link in bio →</span>
  </div>
</body>
</html>
```

- [ ] **Step 3: Verify file exists**

```bash
ls -la scripts/instagram/templates/feed-feature.html
```
Expected: file present, ~4KB.

- [ ] **Step 4: Commit**

```bash
git add scripts/instagram/templates/feed-feature.html
git commit -m "feat: add feed-feature HTML template for Playwright renderer"
```

---

### Task 2: Create `feed-metrics.html` template

**Files:**
- Create: `scripts/instagram/templates/feed-metrics.html`

- [ ] **Step 1: Write `feed-metrics.html`**

Create `scripts/instagram/templates/feed-metrics.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
  body {
    width: 1080px; height: 1080px;
    background: #060608; color: #f8fafc;
    font-family: 'Inter', sans-serif;
    position: relative; display: flex;
    flex-direction: column; padding: 64px; gap: 36px;
  }
  .grid-bg {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
    background-size: 36px 36px; pointer-events: none;
  }
  .glow-tl {
    position: absolute; width: 380px; height: 380px; border-radius: 50%;
    background: radial-gradient(circle, rgba(129,140,248,0.08) 0%, transparent 70%);
    top: -100px; right: -60px; filter: blur(60px);
  }
  .glow-br {
    position: absolute; width: 300px; height: 300px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0,229,153,0.07) 0%, transparent 70%);
    bottom: -70px; left: -50px; filter: blur(60px);
  }
  .row { display: flex; align-items: center; justify-content: space-between; position: relative; }
  .pill {
    background: rgba(129,140,248,0.12); border: 1px solid rgba(129,140,248,0.25);
    color: #818cf8; font-family: 'JetBrains Mono', monospace;
    font-size: 18px; font-weight: 600; letter-spacing: 0.06em;
    padding: 8px 20px; border-radius: 99px; text-transform: uppercase;
  }
  .version { font-family: 'JetBrains Mono', monospace; font-size: 16px; color: #334155; letter-spacing: 0.04em; }
  .headline { font-size: 60px; font-weight: 900; line-height: 1.1; letter-spacing: -0.04em; color: #f8fafc; position: relative; }
  .headline .accent { color: #818cf8; }
  .stat-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 20px; position: relative;
  }
  .stat-cell {
    background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 20px; padding: 28px 24px; text-align: center;
  }
  .stat-val {
    font-family: 'JetBrains Mono', monospace;
    font-size: 52px; font-weight: 700; letter-spacing: -0.04em; line-height: 1;
  }
  .stat-lbl { font-size: 16px; color: #64748b; margin-top: 8px; letter-spacing: 0.01em; }
  .quote-block {
    border-left: 3px solid #00e599;
    padding: 20px 28px;
    background: rgba(0,229,153,0.04);
    border-radius: 0 12px 12px 0;
    position: relative;
  }
  .quote-text {
    font-size: 22px; font-style: italic; color: #94a3b8; line-height: 1.5;
    letter-spacing: -0.01em;
  }
  .footer { display: flex; align-items: center; justify-content: space-between; position: relative; }
  .logo-mark { display: flex; align-items: center; gap: 14px; }
  .logo-img { width: 48px; height: 48px; object-fit: contain; filter: drop-shadow(0 0 10px rgba(0,229,153,0.35)); }
  .logo-name { font-size: 26px; font-weight: 700; color: #f8fafc; letter-spacing: -0.03em; }
  .cta-tag { font-family: 'JetBrains Mono', monospace; font-size: 16px; color: #818cf8; letter-spacing: 0.04em; }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="glow-tl"></div>
  <div class="glow-br"></div>

  <div class="row">
    <div class="pill">{{PILL}}</div>
    <div class="version">{{VERSION}}</div>
  </div>

  <div class="headline">{{HEADLINE}}<br><span class="accent">{{HEADLINE_ACCENT}}</span>{{HEADLINE_2}}</div>

  <div class="stat-grid">
    <div class="stat-cell">
      <div class="stat-val" style="color:{{STAT_1_COLOR}}">{{STAT_1_VAL}}</div>
      <div class="stat-lbl">{{STAT_1_LBL}}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-val" style="color:{{STAT_2_COLOR}}">{{STAT_2_VAL}}</div>
      <div class="stat-lbl">{{STAT_2_LBL}}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-val" style="color:{{STAT_3_COLOR}}">{{STAT_3_VAL}}</div>
      <div class="stat-lbl">{{STAT_3_LBL}}</div>
    </div>
    <div class="stat-cell">
      <div class="stat-val" style="color:{{STAT_4_COLOR}}">{{STAT_4_VAL}}</div>
      <div class="stat-lbl">{{STAT_4_LBL}}</div>
    </div>
  </div>

  <div class="quote-block">
    <div class="quote-text">"{{QUOTE}}"</div>
  </div>

  <div class="footer">
    <div class="logo-mark">
      <img class="logo-img" src="data:image/png;base64,{{LOGO_B64}}" alt="FlowFolio">
      <span class="logo-name">FlowFolio</span>
    </div>
    <span class="cta-tag">link in bio →</span>
  </div>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add scripts/instagram/templates/feed-metrics.html
git commit -m "feat: add feed-metrics HTML template for Playwright renderer"
```

---

### Task 3: Create `carousel-slide.html` template

**Files:**
- Create: `scripts/instagram/templates/carousel-slide.html`

- [ ] **Step 1: Write `carousel-slide.html`**

Create `scripts/instagram/templates/carousel-slide.html`. The `{{SLIDE_TYPE}}` token is injected into `<body data-type="...">`. CSS attribute selectors on `body[data-type]` control default visibility. JavaScript (which runs before the screenshot — Playwright waits for `networkidle`) then explicitly shows/hides the correct layout div and hides the stat chip when its content is empty.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { width: 1080px; height: 1080px; overflow: hidden; }
  body {
    width: 1080px; height: 1080px;
    background: #060608; color: #f8fafc;
    font-family: 'Inter', sans-serif;
    position: relative; display: flex; flex-direction: column;
  }
  .grid-bg {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(rgba(255,255,255,0.018) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.018) 1px, transparent 1px);
    background-size: 36px 36px; pointer-events: none;
  }
  .glow-a {
    position: absolute; width: 360px; height: 360px; border-radius: 50%;
    background: radial-gradient(circle, rgba(0,229,153,0.08) 0%, transparent 70%);
    top: -80px; right: -60px; filter: blur(50px);
  }
  .glow-b {
    position: absolute; width: 280px; height: 280px; border-radius: 50%;
    background: radial-gradient(circle, rgba(129,140,248,0.07) 0%, transparent 70%);
    bottom: -60px; left: -40px; filter: blur(50px);
  }

  /* ── Header (all slides) ── */
  .slide-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 48px 64px 0; position: relative;
  }
  .pill {
    background: rgba(0,229,153,0.12); border: 1px solid rgba(0,229,153,0.25);
    color: #00e599; font-family: 'JetBrains Mono', monospace;
    font-size: 17px; font-weight: 600; letter-spacing: 0.06em;
    padding: 7px 18px; border-radius: 99px; text-transform: uppercase;
  }
  .slide-counter {
    font-family: 'JetBrains Mono', monospace;
    font-size: 16px; color: #334155; letter-spacing: 0.04em;
  }
  .slide-counter .current { color: #64748b; }

  /* All layout divs hidden by default; JS shows the correct one */
  .slide-body { display: none; flex-direction: column; }

  /* ── Cover layout ── */
  #layout-cover {
    flex: 1;
    align-items: center; justify-content: center;
    padding: 40px 80px; text-align: center; gap: 32px;
  }
  .cover-logo { width: 80px; height: 80px; object-fit: contain; filter: drop-shadow(0 0 20px rgba(0,229,153,0.4)); }
  .cover-headline { font-size: 64px; font-weight: 900; line-height: 1.1; letter-spacing: -0.04em; color: #f8fafc; }
  .cover-headline .accent { color: #00e599; }
  .cover-sub { font-size: 22px; color: #64748b; line-height: 1.5; font-weight: 500; max-width: 700px; }
  .cover-swipe { font-family: 'JetBrains Mono', monospace; font-size: 15px; color: #334155; letter-spacing: 0.06em; text-transform: uppercase; }

  /* ── Content layout ── */
  #layout-content {
    flex: 1;
    padding: 40px 64px 0; gap: 28px; position: relative;
  }
  .concept-label { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: #00e599; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 600; }
  .concept-title { font-size: 52px; font-weight: 900; line-height: 1.1; letter-spacing: -0.04em; color: #f8fafc; }
  .concept-title .accent { color: #00e599; }
  .divider { width: 56px; height: 3px; background: #00e599; border-radius: 2px; }
  .body-text { font-size: 22px; color: #94a3b8; line-height: 1.6; font-weight: 400; flex: 1; }
  .stat-chip {
    display: inline-flex; align-items: center; gap: 10px;
    background: rgba(0,229,153,0.08); border: 1px solid rgba(0,229,153,0.2);
    border-radius: 12px; padding: 10px 20px; align-self: flex-start;
  }
  .stat-chip-val { font-family: 'JetBrains Mono', monospace; font-size: 22px; font-weight: 700; color: #00e599; }
  .stat-chip-lbl { font-size: 14px; color: #64748b; font-family: 'JetBrains Mono', monospace; }

  /* ── CTA layout ── */
  #layout-cta {
    flex: 1;
    align-items: center; justify-content: center;
    padding: 40px 80px; text-align: center; gap: 32px;
  }
  .cta-logo { width: 80px; height: 80px; object-fit: contain; filter: drop-shadow(0 0 20px rgba(0,229,153,0.4)); }
  .cta-headline { font-size: 56px; font-weight: 900; line-height: 1.15; letter-spacing: -0.04em; color: #f8fafc; }
  .cta-handle { font-size: 32px; font-weight: 700; color: #00e599; letter-spacing: -0.02em; }
  .cta-btn { background: linear-gradient(135deg, #00e599, #34ffc2); color: #060608; font-weight: 700; font-size: 20px; padding: 16px 48px; border-radius: 12px; letter-spacing: -0.01em; }
  .cta-sub { font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #334155; letter-spacing: 0.04em; }

  /* ── Footer (shown on cover + content; hidden on CTA) ── */
  .slide-footer {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 64px 48px; position: relative;
  }
  .logo-mark { display: flex; align-items: center; gap: 12px; }
  .logo-img { width: 40px; height: 40px; object-fit: contain; filter: drop-shadow(0 0 8px rgba(0,229,153,0.3)); }
  .logo-name { font-size: 22px; font-weight: 700; color: #f8fafc; letter-spacing: -0.03em; }
  .footer-counter { font-family: 'JetBrains Mono', monospace; font-size: 14px; color: #334155; }
</style>
</head>
<body>
  <div class="grid-bg"></div>
  <div class="glow-a"></div>
  <div class="glow-b"></div>

  <div class="slide-header">
    <div class="pill">{{PILL}}</div>
    <div class="slide-counter">
      <span class="current">{{SLIDE_N}}</span> / {{SLIDE_TOTAL}}
    </div>
  </div>

  <!-- COVER -->
  <div class="slide-body" id="layout-cover">
    <img class="cover-logo" src="data:image/png;base64,{{LOGO_B64}}" alt="">
    <div class="cover-headline">{{HEADLINE}}<br><span class="accent">{{HEADLINE_ACCENT}}</span>{{HEADLINE_2}}</div>
    <div class="cover-sub">{{BODY}}</div>
    <div class="cover-swipe">Swipe to learn →</div>
  </div>

  <!-- CONTENT -->
  <div class="slide-body" id="layout-content">
    <div class="concept-label">Concept {{SLIDE_N}}</div>
    <div class="concept-title">{{CONCEPT}}<span class="accent">{{HEADLINE_ACCENT}}</span></div>
    <div class="divider"></div>
    <div class="body-text">{{BODY}}</div>
    <div class="stat-chip" id="stat-chip">
      <span class="stat-chip-val">{{STAT}}</span>
      <span class="stat-chip-lbl">{{STAT_LBL}}</span>
    </div>
  </div>

  <!-- CTA -->
  <div class="slide-body" id="layout-cta">
    <img class="cta-logo" src="data:image/png;base64,{{LOGO_B64}}" alt="">
    <div class="cta-headline">{{HEADLINE}}</div>
    <div class="cta-handle">{{CTA_HANDLE}}</div>
    <div class="cta-btn">{{CTA_LINE}}</div>
    <div class="cta-sub">{{CTA_SUB}}</div>
  </div>

  <div class="slide-footer" id="slide-footer">
    <div class="logo-mark">
      <img class="logo-img" src="data:image/png;base64,{{LOGO_B64}}" alt="">
      <span class="logo-name">FlowFolio</span>
    </div>
    <div class="footer-counter">{{SLIDE_N}} / {{SLIDE_TOTAL}}</div>
  </div>

  <script>
    // Show only the layout div matching the injected SLIDE_TYPE token.
    // All .slide-body divs start display:none via CSS; this JS sets the correct one to flex.
    const type = '{{SLIDE_TYPE}}';
    const layoutDiv = document.getElementById('layout-' + type);
    if (layoutDiv) layoutDiv.style.display = 'flex';

    // Hide footer on CTA slide
    if (type === 'cta') {
      document.getElementById('slide-footer').style.display = 'none';
    }

    // Hide stat chip when STAT token is empty string.
    // Must use JS (not CSS :empty) because the chip has child <span> elements
    // regardless of whether those spans contain text.
    const statChip = document.getElementById('stat-chip');
    if (statChip) {
      const statVal = statChip.querySelector('.stat-chip-val');
      if (!statVal || !statVal.textContent.trim()) {
        statChip.style.display = 'none';
      }
    }
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add scripts/instagram/templates/carousel-slide.html
git commit -m "feat: add carousel-slide HTML template for Playwright renderer"
```

---

## Chunk 2: Content Parser

### Task 4: Implement `content-parser.ts`

**Files:**
- Create: `scripts/instagram/render/content-parser.ts`

- [ ] **Step 1: Create render directory**

```bash
mkdir -p scripts/instagram/render
```

- [ ] **Step 2: Write `content-parser.ts`**

Create `scripts/instagram/render/content-parser.ts`:

```typescript
/**
 * Maps schedule DB caption + composition type → token map for HTML templates.
 * Uses keyword-based topic detection + pre-defined TOPIC_DATA (no LLM required).
 */

export type TopicKey =
  | 'portfolio-optimization'
  | 'build-in-public'
  | 'financial-literacy'
  | 'quant-concepts'
  | 'privacy-first'
  | 'rebalancing'
  | 'investing-education'
  | 'general';

interface SlideData {
  concept: string;
  headlineAccent: string;
  body: string;
  stat: string;
  statLbl: string;
}

interface TopicData {
  pill: string;
  headline: string;
  headlineAccent: string;
  headline2: string;
  kpis: Array<{ val: string; lbl: string; color: string }>;
  bars: Array<{ label: string; pct: number; color: string }>;
  stats: Array<{ val: string; lbl: string; color: string }>;
  quote: string;
  carouselCoverSub: string;
  carouselSlides: SlideData[];
}

const COLORS = {
  green: '#00e599',
  accent: '#818cf8',
  blue: '#38bdf8',
  rose: '#fb7185',
  amber: '#fbbf24',
  cyan: '#22d3ee',
};

const TOPIC_DATA: Record<TopicKey, TopicData> = {
  'portfolio-optimization': {
    pill: 'Portfolio Optimization',
    headline: 'Your portfolio has risks',
    headlineAccent: " you can't see.",
    headline2: '',
    kpis: [
      { val: '+23%', lbl: 'Sharpe Δ', color: COLORS.green },
      { val: '−18%', lbl: 'Max Drawdown', color: COLORS.rose },
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.blue },
    ],
    bars: [
      { label: 'Technology', pct: 72, color: COLORS.green },
      { label: 'Finance', pct: 14, color: COLORS.accent },
      { label: 'Energy', pct: 8, color: COLORS.blue },
      { label: 'Consumer', pct: 6, color: COLORS.amber },
    ],
    stats: [
      { val: '+23%', lbl: 'Sharpe Improvement', color: COLORS.green },
      { val: '−18%', lbl: 'Max Drawdown', color: COLORS.rose },
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.blue },
      { val: '94%', lbl: 'On Efficient Frontier', color: COLORS.green },
    ],
    quote: 'Math, not opinions. The efficient frontier shows you exactly what to change.',
    carouselCoverSub: 'How to build a portfolio that actually works — using quantitative optimization.',
    carouselSlides: [
      { concept: 'Efficient Frontier', headlineAccent: '', body: 'Every possible portfolio can be plotted on a risk-return chart. The efficient frontier is the upper edge — the set of portfolios that give maximum return for a given level of risk. Your job is to get there.', stat: '94%', statLbl: 'of portfolios are sub-optimal' },
      { concept: 'Sharpe Ratio', headlineAccent: '', body: 'Return means nothing without context. The Sharpe ratio measures return per unit of risk. Above 1.0 is good. Above 1.5 is great. Above 2.0 is exceptional — and rare.', stat: '1.84', statLbl: 'FlowFolio benchmark' },
      { concept: 'Maximum Drawdown', headlineAccent: '', body: "Max drawdown is the largest peak-to-trough decline in your portfolio. It answers: how bad did it actually get? Knowing your drawdown threshold is how you size positions without blowing up.", stat: '−18%', statLbl: 'avg max DD S&P 500' },
      { concept: 'Sector Concentration', headlineAccent: '', body: 'Most retail portfolios are secretly 70%+ tech even when they look diversified. Sector allocation analysis breaks down your real exposure — not the names you hold, but the risks you are actually carrying.', stat: '72%', statLbl: 'avg tech concentration' },
      { concept: 'Correlation Heatmap', headlineAccent: '', body: 'Diversification is about correlation, not count. Holding 20 stocks that all move together is no better than holding 1. A correlation heatmap reveals which holdings actually reduce risk.', stat: '0.91', statLbl: 'avg peer correlation' },
      { concept: 'Rebalancing Signal', headlineAccent: '', body: 'Portfolios drift. A position that started at 10% can become 25% after a bull run. Systematic rebalancing signals tell you exactly when and how much to trim.', stat: '2×/year', statLbl: 'optimal rebalance freq' },
    ],
  },

  'build-in-public': {
    pill: 'Build in Public',
    headline: 'I built the tool',
    headlineAccent: ' I wished existed.',
    headline2: '',
    kpis: [
      { val: 'v0.2.2', lbl: 'Current Version', color: COLORS.green },
      { val: '296', lbl: 'Tests Passing', color: COLORS.blue },
      { val: '8', lbl: 'New Features', color: COLORS.amber },
    ],
    bars: [
      { label: 'Rust', pct: 45, color: COLORS.rose },
      { label: 'TypeScript', pct: 35, color: COLORS.blue },
      { label: 'React', pct: 15, color: COLORS.cyan },
      { label: 'CSS', pct: 5, color: COLORS.accent },
    ],
    stats: [
      { val: 'v0.2.2', lbl: 'Latest Release', color: COLORS.green },
      { val: '8', lbl: 'New Tabs Added', color: COLORS.accent },
      { val: '6', lbl: 'Bugs Fixed', color: COLORS.blue },
      { val: '296', lbl: 'Tests Passing', color: COLORS.green },
    ],
    quote: 'The best tool is the one you build because nothing else exists.',
    carouselCoverSub: 'The honest story of building FlowFolio — a quant investing app — in public.',
    carouselSlides: [
      { concept: 'The Problem', headlineAccent: '', body: 'Every investing app either locks your data in the cloud, charges a subscription, or sells your order flow. I wanted something different: professional-grade tools that run entirely on my machine.', stat: '', statLbl: '' },
      { concept: 'The Stack', headlineAccent: '', body: 'Tauri 2 for the native shell. Rust for the backend — fast, safe, zero GC pauses. React 19 for the UI. SQLite for local storage. No servers. No accounts. No telemetry.', stat: '', statLbl: '' },
      { concept: 'v0.1 — The Core', headlineAccent: '', body: 'Vibe Studio: factor-weighted strategy builder. Backtest engine: 20 years of historical data. Portfolio optimizer: Sharpe maximization. All local, all fast.', stat: '', statLbl: '' },
      { concept: 'v0.2 — The Data Layer', headlineAccent: '', body: '8 market data providers with health-based failover, multi-tier caching, and circuit breakers. Real-time prices without paying $200/month for a Bloomberg terminal.', stat: '8', statLbl: 'data providers' },
      { concept: 'v0.2.2 — The Dashboard', headlineAccent: '', body: '8 new tabs: Portfolio Dashboard, Risk Dashboard, Comparison Mode, Price Alerts, News Sentiment, Rebalance Scheduler, Watchlist, and Credits. One unified command center.', stat: '8', statLbl: 'new components' },
      { concept: "What's Next", headlineAccent: '', body: 'Mobile companion app. AI-powered portfolio agent with memory. Options flow analysis. Community strategy sharing with zero data exposure. Building this in public — follow along.', stat: '', statLbl: '' },
    ],
  },

  'financial-literacy': {
    pill: 'Financial Literacy',
    headline: 'Investing knowledge',
    headlineAccent: ' without the jargon.',
    headline2: '',
    kpis: [
      { val: '8', lbl: 'Concepts', color: COLORS.green },
      { val: '0', lbl: 'Paywalls', color: COLORS.accent },
      { val: '∞', lbl: 'Value', color: COLORS.blue },
    ],
    bars: [
      { label: 'Strategy', pct: 80, color: COLORS.green },
      { label: 'Risk Mgmt', pct: 65, color: COLORS.accent },
      { label: 'Analysis', pct: 50, color: COLORS.blue },
      { label: 'Psychology', pct: 40, color: COLORS.amber },
    ],
    stats: [
      { val: '8', lbl: 'Key Concepts', color: COLORS.green },
      { val: '$0', lbl: 'Cost to Learn', color: COLORS.accent },
      { val: '∞', lbl: 'Return on Knowledge', color: COLORS.blue },
      { val: '1', lbl: 'Tool to Apply It', color: COLORS.green },
    ],
    quote: "Financial literacy shouldn't be a luxury. These concepts belong to everyone.",
    carouselCoverSub: 'No jargon. No gatekeeping. Just the investing knowledge that actually moves the needle.',
    carouselSlides: [
      { concept: 'Compound Interest', headlineAccent: '', body: '$10,000 at 10%/year becomes $174,000 in 30 years — without adding a dollar. Time in the market beats timing the market, always.', stat: '17×', statLbl: '30yr compound growth' },
      { concept: 'Asset Allocation', headlineAccent: '', body: '90% of portfolio returns come from asset allocation — not stock picking. The split between stocks, bonds, cash, and alternatives determines your long-term trajectory. Get this right first.', stat: '90%', statLbl: 'return from allocation' },
      { concept: 'Dollar-Cost Averaging', headlineAccent: '', body: 'Investing a fixed amount on a schedule removes the anxiety of timing. You buy more shares when prices are low and fewer when high — automatically. Boring is profitable.', stat: '', statLbl: '' },
      { concept: 'P/E Ratio', headlineAccent: '', body: 'Price-to-earnings tells you how much investors are paying per dollar of profit. High P/E = high growth expectations. Low P/E = value or value trap. Compare within sectors, not across them.', stat: '~22×', statLbl: 'S&P 500 avg P/E' },
      { concept: 'Beta & Volatility', headlineAccent: '', body: 'Beta measures how much your stock moves relative to the market. Beta of 1.5 means 50% more volatile than the S&P. High beta = higher potential return AND higher potential loss.', stat: '1.0', statLbl: 'market beta baseline' },
      { concept: 'Margin of Safety', headlineAccent: '', body: "Buy assets at a meaningful discount to their intrinsic value. The gap between price and value is your protection against being wrong. Great businesses bought at bad prices are bad investments.", stat: '30%', statLbl: 'typical margin of safety' },
    ],
  },

  'quant-concepts': {
    pill: 'Quant Finance',
    headline: 'Concepts that',
    headlineAccent: ' separate the best.',
    headline2: '',
    kpis: [
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.green },
      { val: '0.72', lbl: 'Beta', color: COLORS.blue },
      { val: '14.2%', lbl: 'CAGR', color: COLORS.accent },
    ],
    bars: [
      { label: 'Momentum', pct: 60, color: COLORS.green },
      { label: 'Value', pct: 50, color: COLORS.accent },
      { label: 'Quality', pct: 70, color: COLORS.blue },
      { label: 'Low Vol', pct: 45, color: COLORS.amber },
    ],
    stats: [
      { val: '1.84', lbl: 'Sharpe Ratio', color: COLORS.green },
      { val: '0.72', lbl: 'Portfolio Beta', color: COLORS.blue },
      { val: '14.2%', lbl: '10yr CAGR', color: COLORS.accent },
      { val: '−12%', lbl: 'Max Drawdown', color: COLORS.rose },
    ],
    quote: 'These are the metrics institutional investors live by. Now you have them too.',
    carouselCoverSub: 'The quant metrics that institutional investors use — explained simply.',
    carouselSlides: [
      { concept: 'Alpha', headlineAccent: '', body: "Alpha is the excess return above your benchmark. If the S&P returns 10% and your portfolio returns 13%, your alpha is 3%. Consistent positive alpha over time is extremely rare — and extremely valuable.", stat: '+3%', statLbl: 'example alpha' },
      { concept: 'Sharpe Ratio', headlineAccent: '', body: 'Return per unit of risk. Divide your excess return by your portfolio volatility. Above 1.0 is good. Above 2.0 is exceptional. This is the single most useful performance metric.', stat: '1.84', statLbl: 'target Sharpe' },
      { concept: 'Beta', headlineAccent: '', body: 'Market sensitivity. Beta of 0.7 means your portfolio moves 70% as much as the market. Beta of 1.3 means amplified moves both ways. Choose your beta intentionally.', stat: '0.72', statLbl: 'defensive beta' },
      { concept: 'CAGR', headlineAccent: '', body: 'Compound Annual Growth Rate smooths out volatility to show what your portfolio actually returned per year. The honest answer to "how did my investments do?"', stat: '14.2%', statLbl: '10-year CAGR' },
      { concept: 'Factor Exposure', headlineAccent: '', body: 'Every stock has exposures to systematic factors: momentum, value, quality, size, volatility. Understanding your factor exposures tells you WHY your portfolio behaves the way it does.', stat: '', statLbl: '' },
      { concept: 'Information Ratio', headlineAccent: '', body: 'The consistency of your alpha. A high IR means you beat the benchmark consistently, not just occasionally. This is the metric that separates skill from luck.', stat: '0.5+', statLbl: 'excellent IR threshold' },
    ],
  },

  'privacy-first': {
    pill: 'Privacy-First',
    headline: 'Your data stays',
    headlineAccent: ' on your machine.',
    headline2: '',
    kpis: [
      { val: '0', lbl: 'Servers', color: COLORS.green },
      { val: '100%', lbl: 'Local Storage', color: COLORS.blue },
      { val: '0', lbl: 'Tracking', color: COLORS.accent },
    ],
    bars: [
      { label: 'On-device', pct: 100, color: COLORS.green },
      { label: 'Encrypted', pct: 100, color: COLORS.accent },
      { label: 'Open Source', pct: 100, color: COLORS.blue },
      { label: 'Cloud deps', pct: 0, color: COLORS.rose },
    ],
    stats: [
      { val: '0', lbl: 'Cloud Servers', color: COLORS.green },
      { val: '0', lbl: 'Data Collected', color: COLORS.green },
      { val: 'AES', lbl: 'Key Encryption', color: COLORS.blue },
      { val: '100%', lbl: 'Local-First', color: COLORS.accent },
    ],
    quote: 'Your data. Your device. Your rules. Privacy is an engineering constraint, not a marketing angle.',
    carouselCoverSub: 'How FlowFolio was engineered from the ground up to be completely private.',
    carouselSlides: [
      { concept: 'No Server Architecture', headlineAccent: '', body: 'Most fintech apps run on cloud servers — which means your data does too. FlowFolio has no backend server. The app runs natively on your machine. There is no server to breach because there is no server.', stat: '0', statLbl: 'cloud servers' },
      { concept: 'Local SQLite Database', headlineAccent: '', body: 'All your portfolio data lives in a local SQLite database file on your machine. You own the file. You can back it up, move it, delete it. We never see it.', stat: '100%', statLbl: 'local storage' },
      { concept: 'Encrypted API Keys', headlineAccent: '', body: 'Your market data API keys are stored in Tauri Stronghold — an OS-level encrypted vault. They never appear in plain text. Even if someone cloned your drive, the keys would be unreadable without your credentials.', stat: 'AES-256', statLbl: 'encryption standard' },
      { concept: 'Zero Telemetry', headlineAccent: '', body: 'FlowFolio has no analytics, no crash reporters, no usage tracking. We do not know how many people use it, which features they use, or how often they open the app. We built it this way on purpose.', stat: '0', statLbl: 'tracking events' },
      { concept: 'Open Source', headlineAccent: '', body: "Don't trust our privacy claims — verify them. FlowFolio's source code is public. You can read every line, every network call, every data access. Privacy by architecture, verifiable by anyone.", stat: '100%', statLbl: 'auditable code' },
      { concept: 'Offline Capable', headlineAccent: '', body: 'Once your data is cached locally, FlowFolio works without an internet connection. Portfolio analysis, strategy backtesting, journal entries — all available offline.', stat: '', statLbl: '' },
    ],
  },

  'rebalancing': {
    pill: 'Portfolio Rebalancing',
    headline: '70% of my risk',
    headlineAccent: ' was 3 stocks.',
    headline2: '',
    kpis: [
      { val: '70%', lbl: 'Risk Concentrated', color: COLORS.rose },
      { val: '−12%', lbl: 'Drift Detected', color: COLORS.amber },
      { val: '6', lbl: 'Rebalance Signals', color: COLORS.green },
    ],
    bars: [
      { label: 'NVDA', pct: 34, color: COLORS.rose },
      { label: 'AAPL', pct: 22, color: COLORS.amber },
      { label: 'MSFT', pct: 14, color: COLORS.blue },
      { label: 'Other', pct: 30, color: COLORS.accent },
    ],
    stats: [
      { val: '70%', lbl: 'Risk in 3 Stocks', color: COLORS.rose },
      { val: '−12%', lbl: 'Allocation Drift', color: COLORS.amber },
      { val: '6', lbl: 'Rebalance Signals', color: COLORS.green },
      { val: '2×', lbl: 'Optimal/Year', color: COLORS.blue },
    ],
    quote: 'Rebalance with data, not instinct. FlowFolio shows you exactly what to change.',
    carouselCoverSub: "Why your \"diversified\" portfolio is probably more concentrated than you think.",
    carouselSlides: [
      { concept: 'Portfolio Drift', headlineAccent: '', body: 'A position that started at 10% of your portfolio can become 25% after a strong run — without adding a dollar. This drift silently concentrates your risk. FlowFolio tracks it automatically.', stat: '±5%', statLbl: 'trigger threshold' },
      { concept: 'Concentration Risk', headlineAccent: '', body: "Concentration risk is the danger of having too much tied to a single stock, sector, or factor. Most retail investors underestimate this. FlowFolio's Risk Dashboard calculates your real concentration.", stat: '70%', statLbl: 'avg retail concentration' },
      { concept: 'Rebalancing Signal', headlineAccent: '', body: 'A rebalance signal fires when a position drifts more than your configured threshold from its target. FlowFolio generates specific signals — buy X shares of A, sell Y shares of B — not vague suggestions.', stat: '6', statLbl: 'signals generated' },
      { concept: 'Tax-Aware Rebalancing', headlineAccent: '', body: 'Not all rebalances are equal. Selling appreciated positions triggers capital gains. Route new contributions toward underweight positions first — minimizing the tax hit.', stat: '', statLbl: '' },
      { concept: 'Rebalance Timeline', headlineAccent: '', body: 'The Rebalance Scheduler visualizes your entire history — when you last rebalanced, what changed, and which positions are now overdue. It flags positions drifting too long.', stat: '', statLbl: '' },
      { concept: 'Systematic Over Emotional', headlineAccent: '', body: 'The hardest part of rebalancing is fighting the urge to let winners run. A systematic threshold-based approach removes that emotional decision. You set the rules once; FlowFolio tells you when to act.', stat: '', statLbl: '' },
    ],
  },

  'investing-education': {
    pill: 'Investing Education',
    headline: '200 hours of learning.',
    headlineAccent: ' 8 slides.',
    headline2: '',
    kpis: [
      { val: '8', lbl: 'Key Concepts', color: COLORS.green },
      { val: '$0', lbl: 'Cost', color: COLORS.accent },
      { val: '200h', lbl: 'Research Condensed', color: COLORS.blue },
    ],
    bars: [
      { label: 'Fundamentals', pct: 85, color: COLORS.green },
      { label: 'Technical', pct: 60, color: COLORS.accent },
      { label: 'Macro', pct: 45, color: COLORS.blue },
      { label: 'Psychology', pct: 70, color: COLORS.amber },
    ],
    stats: [
      { val: '8', lbl: 'Core Concepts', color: COLORS.green },
      { val: '200h', lbl: 'Research Behind It', color: COLORS.blue },
      { val: '$0', lbl: 'To Access This', color: COLORS.accent },
      { val: '∞', lbl: 'Potential Return', color: COLORS.green },
    ],
    quote: 'The best investment you can make is in your own financial education.',
    carouselCoverSub: 'I spent 200 hours learning this. Here it is condensed into 8 slides.',
    carouselSlides: [
      { concept: 'Your Investment Thesis', headlineAccent: '', body: 'Every great investor starts with a thesis — a clear, written statement of why a position should outperform. Without a thesis, you are speculating. With one, you have a framework to evaluate new information against.', stat: '', statLbl: '' },
      { concept: 'Position Sizing', headlineAccent: '', body: 'The Kelly Criterion tells you the optimal fraction of your portfolio to risk on any single bet, based on your edge and odds. Most professionals use a fraction of Kelly to manage drawdowns.', stat: '1/4 Kelly', statLbl: 'common professional target' },
      { concept: 'Risk vs Volatility', headlineAccent: '', body: 'Risk and volatility are not the same thing. Risk is the probability of permanent loss of capital. Volatility is how much the price moves. A volatile stock of a great business is not risky if you can hold through the noise.', stat: '', statLbl: '' },
      { concept: 'Catalyst Investing', headlineAccent: '', body: 'A catalyst is an event that unlocks a stock\'s value: an earnings beat, a product launch, a regulatory approval. The best trades combine a solid thesis with a near-term catalyst that forces the market to reprice.', stat: '', statLbl: '' },
      { concept: 'Mean Reversion', headlineAccent: '', body: 'Most financial metrics revert toward their long-term averages over time. Abnormally high margins attract competition. Abnormally low P/Es attract value buyers. Understanding mean reversion helps you know when to act.', stat: '', statLbl: '' },
      { concept: 'Conviction vs Overconfidence', headlineAccent: '', body: 'Conviction is holding a position because your thesis is intact. Overconfidence is holding it because you do not want to be wrong. Update your thesis, not your ego.', stat: '', statLbl: '' },
    ],
  },

  'general': {
    pill: 'FlowFolio',
    headline: 'Quantitative investing,',
    headlineAccent: ' simplified.',
    headline2: '',
    kpis: [
      { val: '8+', lbl: 'Data Sources', color: COLORS.green },
      { val: '20yr', lbl: 'Backtest History', color: COLORS.blue },
      { val: '100%', lbl: 'Local & Private', color: COLORS.accent },
    ],
    bars: [
      { label: 'Strategy', pct: 90, color: COLORS.green },
      { label: 'Backtest', pct: 75, color: COLORS.accent },
      { label: 'Portfolio', pct: 80, color: COLORS.blue },
      { label: 'Analysis', pct: 70, color: COLORS.amber },
    ],
    stats: [
      { val: '8+', lbl: 'Market Data Sources', color: COLORS.green },
      { val: '20yr', lbl: 'Backtest History', color: COLORS.blue },
      { val: '30+', lbl: 'Quant Metrics', color: COLORS.accent },
      { val: '0', lbl: 'Cloud Dependencies', color: COLORS.green },
    ],
    quote: 'Professional-grade portfolio tools. Entirely on your machine.',
    carouselCoverSub: 'Everything you need to invest systematically — without giving up your data.',
    carouselSlides: [
      { concept: 'Vibe Studio', headlineAccent: '', body: 'Build factor-weighted investment strategies. Dial up momentum, quality, or value — and watch a quant engine score your universe against your thesis. No templates. Just your conviction, backed by math.', stat: '', statLbl: '' },
      { concept: 'Backtesting', headlineAccent: '', body: 'Test any strategy against 20 years of historical data. CAGR, Sharpe ratio, max drawdown, and 30+ additional metrics. Know how your strategy would have performed before risking a dollar.', stat: '20yr', statLbl: 'historical data' },
      { concept: 'Portfolio Optimization', headlineAccent: '', body: 'Plot your holdings on the efficient frontier. Find the allocation that maximizes your Sharpe ratio. Generate specific rebalancing signals. Go from intuition to math.', stat: '', statLbl: '' },
      { concept: 'Multi-Source Market Data', headlineAccent: '', body: '8 market data providers with health-based failover, multi-tier caching, and circuit breakers. Real-time prices and historical data — no Bloomberg subscription required.', stat: '8', statLbl: 'data providers' },
      { concept: 'Investment Journal', headlineAccent: '', body: 'Log every trade with your thesis, emotion, and outcome. Track whether your reasoning was correct — separate from whether the trade was profitable.', stat: '', statLbl: '' },
      { concept: 'Privacy by Design', headlineAccent: '', body: 'Zero cloud dependencies. Local SQLite database. Encrypted key storage. No telemetry. Your portfolio data never leaves your machine — by architecture, not by policy.', stat: '0', statLbl: 'cloud servers' },
    ],
  },
};

/** Detect topic from caption keywords. Logs a warning when falling to 'general'. */
function detectTopic(caption: string): TopicKey {
  const c = caption.toLowerCase();
  if (c.includes('efficient frontier') || c.includes('optimization') || c.includes('optimal point')) return 'portfolio-optimization';
  if (c.includes('build') && (c.includes('engineer') || c.includes('weekend project') || c.includes('built flowfolio'))) return 'build-in-public';
  if (c.includes('rebalanc') || c.includes('drift') || c.includes('70% of my risk')) return 'rebalancing';
  if (c.includes('privacy') || c.includes('spy on you') || c.includes('cannot spy') || c.includes('offline')) return 'privacy-first';
  if (c.includes('quant') && c.includes('concepts')) return 'quant-concepts';
  if (c.includes('200 hours') || c.includes('condensed it') || c.includes('condensed into')) return 'investing-education';
  if (c.includes('financial literacy') || c.includes('gatekeep') || c.includes('no jargon')) return 'financial-literacy';
  console.warn(`[content-parser] Topic detection fell to 'general' for caption: "${caption.slice(0, 80)}..."`);
  return 'general';
}

/** Build full token map for a given post (excludes LOGO_B64 — injected by renderer) */
export function parsePost(
  composition: string,
  caption: string,
  seed: number,
): Record<string, string> {
  const topic = detectTopic(caption);
  const d = TOPIC_DATA[topic];

  // Tiny numeric jitter driven by seed (±1–3 on percentages) for visual variation
  const jitter = (seed % 5) - 2; // -2 to +2

  const tokens: Record<string, string> = {
    VERSION: 'FlowFolio v0.2.2',
    PILL: d.pill,
    HEADLINE: d.headline,
    HEADLINE_ACCENT: d.headlineAccent,
    HEADLINE_2: d.headline2,
  };

  if (composition === 'feed-feature' || composition === 'feed-metrics') {
    d.kpis.forEach((k, i) => {
      const n = i + 1;
      tokens[`KPI_${n}_VAL`] = k.val;
      tokens[`KPI_${n}_LBL`] = k.lbl;
      tokens[`KPI_${n}_COLOR`] = k.color;
    });

    d.bars.forEach((b, i) => {
      const n = i + 1;
      const pct = Math.max(1, Math.min(99, b.pct + (n % 2 === 0 ? jitter : -jitter)));
      tokens[`BAR_${n}_LABEL`] = b.label;
      tokens[`BAR_${n}_PCT`] = String(pct);
      tokens[`BAR_${n}_COLOR`] = b.color;
    });

    d.stats.forEach((s, i) => {
      const n = i + 1;
      tokens[`STAT_${n}_VAL`] = s.val;
      tokens[`STAT_${n}_LBL`] = s.lbl;
      tokens[`STAT_${n}_COLOR`] = s.color;
    });

    tokens.QUOTE = d.quote;
  }

  if (composition === 'carousel') {
    // Copy the array to avoid mutating shared TOPIC_DATA
    const slides = [...d.carouselSlides];
    // Pad to exactly 6 content slides using 'general' fallback data
    const fallback = TOPIC_DATA['general'].carouselSlides;
    while (slides.length < 6) {
      slides.push(fallback[(slides.length) % fallback.length]);
    }
    tokens.CAROUSEL_COVER_SUB = d.carouselCoverSub;
    tokens.CAROUSEL_SLIDES_JSON = JSON.stringify(slides.slice(0, 6));
    tokens.CTA_HANDLE = '@flowfolio';
    tokens.CTA_LINE = 'Download — link in bio';
    tokens.CTA_SUB = 'Privacy-first · Free · macOS / Windows / Linux';
  }

  return tokens;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck scripts/instagram/render/content-parser.ts 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/instagram/render/content-parser.ts
git commit -m "feat: add content-parser with TOPIC_DATA map for all post themes"
```

---

## Chunk 3: Renderer + Entry Point

### Task 5: Implement `renderer.ts`

**Files:**
- Create: `scripts/instagram/render/renderer.ts`

- [ ] **Step 1: Write `renderer.ts`**

Create `scripts/instagram/render/renderer.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { Browser, chromium } from 'playwright';

export interface RenderOptions {
  templatePath: string;
  tokens: Record<string, string>;
  outputPath: string;
  width?: number;
  height?: number;
}

// Read and base64-encode logo once at module load — fail fast if missing
const LOGO_PATH = path.join(process.cwd(), 'public', 'logo.png');
if (!fs.existsSync(LOGO_PATH)) {
  throw new Error(`logo.png not found at ${LOGO_PATH}. Run generate.ts from the project root.`);
}
export const LOGO_B64 = fs.readFileSync(LOGO_PATH).toString('base64');

/** Replace all {{TOKEN}} occurrences in html with values from tokens map */
function injectTokens(html: string, tokens: Record<string, string>): string {
  let result = html;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replaceAll(`{{${key}}}`, value);
  }
  return result;
}

/** Launch a headless Chromium browser for batch rendering */
export async function launchBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
}

/** Render one HTML template to a PNG file.
 *  Always closes the page — even on error — to prevent browser page leaks.
 *  Throws on any failure; caller is responsible for DB status updates. */
export async function renderPost(browser: Browser, opts: RenderOptions): Promise<void> {
  const { templatePath, tokens, outputPath, width = 1080, height = 1080 } = opts;

  const rawHtml = fs.readFileSync(templatePath, 'utf-8');
  const html = injectTokens(rawHtml, { ...tokens, LOGO_B64 });

  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width, height });
    await page.setContent(html, { waitUntil: 'networkidle', timeout: 30_000 });

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    await page.screenshot({ path: outputPath, type: 'png' });
  } finally {
    // Swallow close errors so they don't shadow the original render error
    await page.close().catch(() => {});
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/instagram/render/renderer.ts
git commit -m "feat: add Playwright renderer (HTML template → PNG)"
```

---

### Task 6: Implement `generate.ts`

**Files:**
- Create: `scripts/instagram/render/generate.ts`

- [ ] **Step 1: Write `generate.ts`**

Create `scripts/instagram/render/generate.ts`:

```typescript
#!/usr/bin/env npx tsx
/**
 * Playwright-based Instagram post generator.
 * Reads pending/rendered posts from schedule DB, renders HTML templates → PNG.
 *
 * CLI usage:
 *   npx tsx scripts/instagram/render/generate.ts                   # all upcoming
 *   npx tsx scripts/instagram/render/generate.ts --post-id <id>    # single post
 *   npx tsx scripts/instagram/render/generate.ts --all-pending     # overdue only
 *
 * Programmatic usage (from content-generator.ts):
 *   import { generatePost } from './render/generate.js'
 *   const { videoPath } = await generatePost(postId)
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  getDb, getUpcomingPosts, getPendingPosts, getPost, updatePostStatus,
  type ScheduledPost,
} from '../schedule-db.js';
import { parsePost } from './content-parser.js';
import { launchBrowser, renderPost } from './renderer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..', '..', '..');
const TEMPLATES = path.join(__dirname, '..', 'templates');
const OUTPUT_DIR = path.join(ROOT, 'out', 'scheduled');

function templateFor(composition: string): string {
  const map: Record<string, string> = {
    'feed-feature': path.join(TEMPLATES, 'feed-feature.html'),
    'feed-metrics': path.join(TEMPLATES, 'feed-metrics.html'),
    'carousel':     path.join(TEMPLATES, 'carousel-slide.html'),
  };
  const tpl = map[composition];
  if (!tpl) throw new Error(`No template for composition: ${composition}`);
  return tpl;
}

function outputPathFor(post: ScheduledPost): string {
  if (post.composition === 'carousel') {
    return path.join(OUTPUT_DIR, `carousel-${post.seed}`);
  }
  return path.join(OUTPUT_DIR, `${post.composition}-${post.seed}.png`);
}

async function renderFeedPost(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  post: ScheduledPost,
  tokens: Record<string, string>,
): Promise<string> {
  const outPath = outputPathFor(post);
  await renderPost(browser, {
    templatePath: templateFor(post.composition),
    tokens,
    outputPath: outPath,
  });
  return outPath;
}

async function renderCarousel(
  browser: Awaited<ReturnType<typeof launchBrowser>>,
  post: ScheduledPost,
  tokens: Record<string, string>,
): Promise<string> {
  const outDir = outputPathFor(post);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const slides: Array<{
    concept: string; headlineAccent: string; body: string; stat: string; statLbl: string;
  }> = JSON.parse(tokens.CAROUSEL_SLIDES_JSON);

  const TOTAL = 8; // 1 cover + 6 content + 1 CTA (always exactly 8)

  // Slide 0: cover
  await renderPost(browser, {
    templatePath: templateFor('carousel'),
    tokens: {
      ...tokens,
      SLIDE_TYPE: 'cover',
      SLIDE_N: '1',
      SLIDE_TOTAL: String(TOTAL),
      HEADLINE: tokens.HEADLINE,
      HEADLINE_ACCENT: tokens.HEADLINE_ACCENT,
      HEADLINE_2: tokens.HEADLINE_2,
      BODY: tokens.CAROUSEL_COVER_SUB,
      CONCEPT: '',
      STAT: '',
      STAT_LBL: '',
    },
    outputPath: path.join(outDir, 'slide-00.png'),
  });
  console.log(`  slide-00 (cover) ✓`);

  // Slides 1–6: content
  for (let i = 0; i < 6; i++) {
    const slide = slides[i];
    const slideNum = String(i + 2).padStart(2, '0');
    await renderPost(browser, {
      templatePath: templateFor('carousel'),
      tokens: {
        ...tokens,
        SLIDE_TYPE: 'content',
        SLIDE_N: String(i + 2),
        SLIDE_TOTAL: String(TOTAL),
        CONCEPT: slide.concept,
        HEADLINE: slide.concept,
        HEADLINE_ACCENT: slide.headlineAccent,
        HEADLINE_2: '',
        BODY: slide.body,
        STAT: slide.stat,
        STAT_LBL: slide.statLbl,
      },
      outputPath: path.join(outDir, `slide-${slideNum}.png`),
    });
    console.log(`  slide-${slideNum} (${slide.concept}) ✓`);
  }

  // Slide 7: CTA
  await renderPost(browser, {
    templatePath: templateFor('carousel'),
    tokens: {
      ...tokens,
      SLIDE_TYPE: 'cta',
      SLIDE_N: String(TOTAL),
      SLIDE_TOTAL: String(TOTAL),
      HEADLINE: 'Ready to invest smarter?',
      HEADLINE_ACCENT: '',
      HEADLINE_2: '',
      BODY: '',
      CONCEPT: '',
      STAT: '',
      STAT_LBL: '',
    },
    outputPath: path.join(outDir, 'slide-07.png'),
  });
  console.log(`  slide-07 (CTA) ✓`);

  return outDir;
}

/** Render a single post by ID.
 *  Opens and closes its own browser.
 *  Exported for use by content-generator.ts. */
export async function generatePost(postId: string): Promise<{ videoPath: string }> {
  const db = getDb();
  const post = getPost(db, postId);
  if (!post) throw new Error(`Post not found: ${postId}`);

  const tokens = parsePost(post.composition, post.caption, post.seed);
  updatePostStatus(db, postId, 'rendering');

  const browser = await launchBrowser();
  try {
    let videoPath: string;
    if (post.composition === 'carousel') {
      videoPath = await renderCarousel(browser, post, tokens);
    } else {
      videoPath = await renderFeedPost(browser, post, tokens);
    }
    updatePostStatus(db, postId, 'rendered', { video_path: videoPath });
    return { videoPath };
  } catch (err) {
    updatePostStatus(db, postId, 'failed', { error: (err as Error).message });
    throw err;
  } finally {
    await browser.close();
  }
}

/** CLI batch entry point — shares one browser across all posts for speed */
async function main() {
  const args = process.argv.slice(2);
  const postIdIdx = args.indexOf('--post-id');
  const allPending = args.includes('--all-pending');

  const db = getDb();
  let posts: ScheduledPost[];

  if (postIdIdx !== -1) {
    const id = args[postIdIdx + 1];
    if (!id) { console.error('--post-id requires a value'); process.exit(1); }
    const post = getPost(db, id);
    if (!post) { console.error(`Post not found: ${id}`); process.exit(1); }
    posts = [post];
  } else if (allPending) {
    posts = getPendingPosts(db);
  } else {
    posts = getUpcomingPosts(db);
  }

  if (posts.length === 0) { console.log('No posts to render.'); return; }

  console.log(`\nRendering ${posts.length} post(s)...\n`);

  const browser = await launchBrowser();
  const results: Array<{ id: string; status: string; path?: string }> = [];

  for (const post of posts) {
    console.log(`→ ${post.id} (${post.composition})`);
    const tokens = parsePost(post.composition, post.caption, post.seed);
    updatePostStatus(db, post.id, 'rendering');

    try {
      let videoPath: string;
      if (post.composition === 'carousel') {
        videoPath = await renderCarousel(browser, post, tokens);
      } else {
        videoPath = await renderFeedPost(browser, post, tokens);
      }
      updatePostStatus(db, post.id, 'rendered', { video_path: videoPath });
      results.push({ id: post.id, status: '✅ rendered', path: videoPath });
      console.log(`  → ${videoPath}\n`);
    } catch (err) {
      const msg = (err as Error).message;
      updatePostStatus(db, post.id, 'failed', { error: msg });
      results.push({ id: post.id, status: `❌ ${msg}` });
      console.error(`  ❌ ${msg}\n`);
    }
  }

  await browser.close();

  console.log('\n── Results ──────────────────────────────────');
  results.forEach(r => console.log(`${r.status.padEnd(16)} ${r.id}`));
  console.log('─────────────────────────────────────────────\n');
}

main().catch(err => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/instagram/render/generate.ts
git commit -m "feat: add generate.ts CLI + generatePost() export for Playwright batch renderer"
```

---

## Chunk 4: Integration + Batch Run

### Task 7: Smoke test — single post per type

- [ ] **Step 1: Run a single feed-feature post**

```bash
npx tsx scripts/instagram/render/generate.ts --post-id post-2026-03-17T06-00-00
```
Expected: prints `✅ rendered post-2026-03-17T06-00-00`.

- [ ] **Step 2: Verify the PNG dimensions**

```bash
sips -g pixelWidth -g pixelHeight out/scheduled/feed-feature-1250352753.png
```
Expected: `pixelWidth: 1080` and `pixelHeight: 1080`.

- [ ] **Step 3: Visually inspect the feed-feature image**

```bash
open out/scheduled/feed-feature-1250352753.png
```
Verify: dark background + grid lines, green pill "Portfolio Optimization", two-line headline with green accent word, three KPI chips, four progress bars, logo + "FlowFolio" in footer. No `{{...}}` placeholder text visible anywhere.

- [ ] **Step 4: Run a single feed-metrics post**

```bash
npx tsx scripts/instagram/render/generate.ts --post-id post-2026-03-20T05-00-00
```
Then look up its output path from DB and open:
```bash
npx tsx -e "import Database from 'better-sqlite3'; const db=new Database('.ig-schedule.db'); const row=db.prepare(\"SELECT video_path FROM scheduled_posts WHERE id='post-2026-03-20T05-00-00'\").get(); console.log(row.video_path);"
```
Copy the path printed and run `open <path>`.

Verify: indigo pill, 2×2 stat grid, green quote block, logo footer.

- [ ] **Step 5: Run a single carousel post**

```bash
npx tsx scripts/instagram/render/generate.ts --post-id post-2026-03-19T07-00-00
ls out/scheduled/carousel-1786850429/
```
Expected: 8 files — `slide-00.png` through `slide-07.png`.

```bash
open out/scheduled/carousel-1786850429/slide-00.png
open out/scheduled/carousel-1786850429/slide-03.png
open out/scheduled/carousel-1786850429/slide-07.png
```
Verify cover layout (logo centred, headline, subtitle, "Swipe to learn →"), content layout (concept title, body text, optional stat chip), and CTA layout (logo, handle, green button).

- [ ] **Step 6: Commit**

```bash
git add .ig-schedule.db
git commit -m "feat: smoke test passes — feed-feature, feed-metrics, carousel render correctly"
```

---

### Task 8: Render all 9 upcoming posts

- [ ] **Step 1: Run the full batch**

```bash
npx tsx scripts/instagram/render/generate.ts --upcoming
```
Expected: 9 posts processed, results table shows all ✅.

- [ ] **Step 2: Verify DB status for all posts**

```bash
npx tsx -e "
import Database from 'better-sqlite3';
const db = new Database('.ig-schedule.db');
const posts = db.prepare(\"SELECT id, composition, status, video_path FROM scheduled_posts WHERE scheduled_at > '2026-03-15' ORDER BY scheduled_at\").all();
posts.forEach(p => console.log(p.status.padEnd(10), p.composition.padEnd(14), p.video_path ? '✓' : '✗', p.id));
"
```
Expected: all 9 show `rendered` with `✓` for video_path.

- [ ] **Step 3: Visual spot-check of the full batch**

```bash
open out/scheduled/feed-feature-*.png out/scheduled/feed-metrics-*.png
```
For carousels, open one slide from each:
```bash
for dir in out/scheduled/carousel-*/; do
  [ -f "${dir}slide-00.png" ] && open "${dir}slide-00.png"
done
```
Verify branding consistency across all posts: same dark background, grid, glow effects. Different pill labels per topic. Logo present in all footers.

- [ ] **Step 4: Commit**

```bash
git add .ig-schedule.db
git commit -m "feat: all 9 upcoming scheduled posts rendered via Playwright HTML renderer"
```

---

### Task 9: Wire into `content-generator.ts` and `scheduler.ts`

**Files:**
- Modify: `scripts/instagram/content-generator.ts` (lines 684–696)
- Modify: `scripts/instagram/scheduler.ts` (lines 122–154, 198–211)

The goal: `renderContent` (which `scheduler.ts` uses) delegates to the Playwright renderer for `feed-feature`, `feed-metrics`, and `carousel` composition types. The existing Remotion paths for other types (video, etc.) remain as fallback.

- [ ] **Step 1: Add import to `content-generator.ts`**

Open `scripts/instagram/content-generator.ts`. After the existing imports at the top of the file, add:

```typescript
import { generatePost } from './render/generate.js';
```

- [ ] **Step 2: Replace `renderContent` at line 684**

Find the function at line 684:
```typescript
export function renderContent(compositionKey: string, seed: number): string {
  const comp = COMPOSITIONS[compositionKey];
  if (!comp) throw new Error(`Unknown composition: ${compositionKey}`);

  ensureOutputDir();

  if (comp.type === 'carousel') {
    return renderCarousel(comp, seed);
  }
  if (comp.type === 'still') {
    return renderStill(comp, seed);
  }
  return renderVideo(comp, seed);
}
```

Add a new async export **above** this function (do not modify `renderContent` itself — `scheduler.ts` will be updated to call the new function):

```typescript
/**
 * Async Playwright-based renderer for feed-feature, feed-metrics, and carousel.
 * Called by scheduler.ts with await. Falls back to sync renderContent for other types.
 */
export async function renderContentPlaywright(postId: string): Promise<string> {
  const { videoPath } = await generatePost(postId);
  return videoPath;
}
```

- [ ] **Step 3: Update `cmdRender` in `scheduler.ts` (lines 122–154)**

Open `scripts/instagram/scheduler.ts`. Find `cmdRender` (around line 122). It currently calls `renderContent(post.composition, post.seed)` synchronously.

Change the function signature from `function cmdRender(...)` to `async function cmdRender(...)` and replace line 146:
```typescript
// Before:
const videoPath = renderContent(post.composition, post.seed);

// After:
const videoPath = await renderContentPlaywright(post.id);
```

Also add `renderContentPlaywright` to the import from `./content-generator` at line 37:
```typescript
// Before:
import { generateSeed, generateContentPlan, renderContent, ContentMix, COMPOSITIONS } from './content-generator';

// After:
import { generateSeed, generateContentPlan, renderContent, renderContentPlaywright, ContentMix, COMPOSITIONS } from './content-generator';
```

- [ ] **Step 4: Update `tick` in `scheduler.ts` (line 205)**

In the `tick` async function, find line 205:
```typescript
videoPath = renderContent(post.composition, post.seed);
```
Replace with:
```typescript
videoPath = await renderContentPlaywright(post.id);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit --skipLibCheck scripts/instagram/content-generator.ts scripts/instagram/scheduler.ts 2>&1 | head -20
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/instagram/content-generator.ts scripts/instagram/scheduler.ts
git commit -m "feat: wire scheduler to Playwright renderer via renderContentPlaywright()"
```

---

### Task 10: Add npm script shortcuts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add render scripts to `package.json`**

In the `"scripts"` block, add these three entries (alongside the existing `ig:` scripts):

```json
"ig:render": "npx tsx scripts/instagram/render/generate.ts",
"ig:render:pending": "npx tsx scripts/instagram/render/generate.ts --all-pending",
"ig:render:single": "npx tsx scripts/instagram/render/generate.ts --post-id"
```

- [ ] **Step 2: Test the script runs**

```bash
npm run ig:render:pending
```
Expected: `No posts to render.` (all posts already rendered in Task 8).

- [ ] **Step 3: Final commit**

```bash
git add package.json
git commit -m "chore: add ig:render npm scripts for Playwright post renderer"
```
