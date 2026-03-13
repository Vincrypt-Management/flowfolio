#!/usr/bin/env npx tsx
/**
 * Generate v0.2.2 release announcement carousel slides and post to Instagram.
 * Usage: npx tsx scripts/instagram/post-release.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

const OUTPUT_DIR = path.join(__dirname, '..', '..', 'out', 'release-0.2.2');

// ── Slide HTML templates ─────────────────────────────────

function baseStyles(): string {
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap');
    body {
      width: 1080px; height: 1080px;
      background: #050505;
      font-family: 'Inter', -apple-system, sans-serif;
      color: #fff;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .slide {
      width: 1080px; height: 1080px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 80px;
    }
    .grid-bg {
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(0,229,153,0.04) 1px, transparent 1px),
        linear-gradient(90deg, rgba(0,229,153,0.04) 1px, transparent 1px);
      background-size: 60px 60px;
    }
    .glow-tl {
      position: absolute; top: -200px; left: -200px;
      width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(0,229,153,0.12) 0%, transparent 70%);
      pointer-events: none;
    }
    .glow-br {
      position: absolute; bottom: -200px; right: -200px;
      width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(99,102,241,0.1) 0%, transparent 70%);
      pointer-events: none;
    }
    .content { position: relative; z-index: 1; width: 100%; }
    .tag {
      display: inline-block;
      background: rgba(0,229,153,0.12);
      border: 1px solid rgba(0,229,153,0.3);
      color: #00e599;
      font-family: 'JetBrains Mono', monospace;
      font-size: 16px;
      font-weight: 600;
      padding: 8px 20px;
      border-radius: 40px;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin-bottom: 32px;
    }
    h1 {
      font-size: 64px;
      font-weight: 800;
      line-height: 1.1;
      letter-spacing: -2px;
      margin-bottom: 24px;
    }
    h2 {
      font-size: 48px;
      font-weight: 700;
      line-height: 1.15;
      letter-spacing: -1.5px;
      margin-bottom: 28px;
    }
    .green { color: #00e599; }
    .purple { color: #6366f1; }
    .dim { color: #a1a1aa; }
    .subtitle {
      font-size: 22px;
      color: #a1a1aa;
      line-height: 1.5;
      max-width: 800px;
    }
    .feature-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 24px;
      width: 100%;
    }
    .feature-list li {
      display: flex;
      align-items: flex-start;
      gap: 20px;
      font-size: 24px;
      line-height: 1.4;
      color: #e4e4e7;
    }
    .feature-icon {
      flex-shrink: 0;
      width: 48px; height: 48px;
      background: rgba(0,229,153,0.1);
      border: 1px solid rgba(0,229,153,0.25);
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
    }
    .feature-icon.purple-icon {
      background: rgba(99,102,241,0.1);
      border-color: rgba(99,102,241,0.25);
    }
    .version-badge {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      background: linear-gradient(135deg, #00e599, #6366f1);
      color: #000;
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px;
      font-weight: 700;
      padding: 14px 36px;
      border-radius: 14px;
      margin-top: 20px;
    }
    .divider {
      width: 60px; height: 3px;
      background: linear-gradient(90deg, #00e599, #6366f1);
      border-radius: 2px;
      margin: 28px 0;
    }
    .stat-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      width: 100%;
    }
    .stat-card {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 16px;
      padding: 32px;
      text-align: center;
    }
    .stat-value {
      font-family: 'JetBrains Mono', monospace;
      font-size: 48px;
      font-weight: 700;
      color: #00e599;
      margin-bottom: 8px;
    }
    .stat-label {
      font-size: 18px;
      color: #a1a1aa;
    }
    .cta-box {
      width: 100%;
      background: rgba(0,229,153,0.06);
      border: 1px solid rgba(0,229,153,0.2);
      border-radius: 20px;
      padding: 48px;
      text-align: center;
    }
    .logo-row {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }
    .logo-icon {
      width: 56px; height: 56px;
      background: linear-gradient(135deg, #00e599, #6366f1);
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-family: 'JetBrains Mono', monospace;
      font-size: 28px; font-weight: 800; color: #000;
    }
    .logo-text {
      font-size: 32px; font-weight: 800; letter-spacing: -1px;
    }
    .watermark {
      position: absolute;
      bottom: 40px;
      right: 50px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 14px;
      color: rgba(255,255,255,0.15);
      letter-spacing: 0.5px;
    }
  `;
}

const slides: { name: string; html: string }[] = [
  // Slide 1: Title
  {
    name: '01-title',
    html: `<style>${baseStyles()}</style>
    <div class="slide">
      <div class="grid-bg"></div>
      <div class="glow-tl"></div>
      <div class="glow-br"></div>
      <div class="content" style="text-align:center; display:flex; flex-direction:column; align-items:center;">
        <div class="logo-row" style="justify-content:center; margin-bottom:32px;">
          <div class="logo-icon">F</div>
          <span class="logo-text">FlowFolio</span>
        </div>
        <div class="tag">Release v0.2.2</div>
        <h1>8 New Tabs.<br/><span class="green">One Command Center.</span></h1>
        <div class="divider" style="margin:20px auto;"></div>
        <p class="subtitle">Dashboard, risk analysis, alerts, news sentiment,<br/>watchlists, comparison mode, and more.</p>
        <div class="version-badge" style="margin-top:40px;">v0.2.2 &mdash; Now Live</div>
      </div>
      <div class="watermark">@flowfolio.ai</div>
    </div>`,
  },

  // Slide 2: Dashboard + Watchlist
  {
    name: '02-dashboard',
    html: `<style>${baseStyles()}</style>
    <div class="slide">
      <div class="grid-bg"></div>
      <div class="glow-tl"></div>
      <div class="content">
        <div class="tag">Command Center</div>
        <h2>Dashboard &<br/><span class="green">Watchlist</span></h2>
        <ul class="feature-list">
          <li>
            <div class="feature-icon">&#128202;</div>
            <div><strong style="color:#fff;">Portfolio Dashboard</strong><br/><span class="dim">Summary cards, sector donut chart, top movers, and quick actions</span></div>
          </li>
          <li>
            <div class="feature-icon">&#128065;</div>
            <div><strong style="color:#fff;">Watchlist Manager</strong><br/><span class="dim">Track symbols across universes with live price feeds</span></div>
          </li>
          <li>
            <div class="feature-icon purple-icon">&#128200;</div>
            <div><strong style="color:#fff;">Market Ticker</strong><br/><span class="dim">Live scrolling ticker strip with real-time price changes</span></div>
          </li>
          <li>
            <div class="feature-icon purple-icon">&#9889;</div>
            <div><strong style="color:#fff;">Quick Actions</strong><br/><span class="dim">One-click access to scoring, buy lists, backtests, and journal</span></div>
          </li>
        </ul>
      </div>
      <div class="watermark">@flowfolio.ai</div>
    </div>`,
  },

  // Slide 3: Risk + Comparison
  {
    name: '03-risk',
    html: `<style>${baseStyles()}</style>
    <div class="slide">
      <div class="grid-bg"></div>
      <div class="glow-br"></div>
      <div class="content">
        <div class="tag">Analysis</div>
        <h2>Risk Dashboard &<br/><span class="purple">Comparison Mode</span></h2>
        <ul class="feature-list">
          <li>
            <div class="feature-icon">&#128737;&#65039;</div>
            <div><strong style="color:#fff;">Composite Risk Score</strong><br/><span class="dim">SVG gauge combining volatility, drawdown, concentration, and Sharpe</span></div>
          </li>
          <li>
            <div class="feature-icon">&#127919;</div>
            <div><strong style="color:#fff;">Value at Risk (95%)</strong><br/><span class="dim">Daily VaR with correlation heatmap and drawdown timeline</span></div>
          </li>
          <li>
            <div class="feature-icon purple-icon">&#128260;</div>
            <div><strong style="color:#fff;">Side-by-Side Compare</strong><br/><span class="dim">Normalized price charts and head-to-head quant metrics</span></div>
          </li>
          <li>
            <div class="feature-icon purple-icon">&#128201;</div>
            <div><strong style="color:#fff;">Concentration Bars</strong><br/><span class="dim">Visual weight distribution with color-coded risk levels</span></div>
          </li>
        </ul>
      </div>
      <div class="watermark">@flowfolio.ai</div>
    </div>`,
  },

  // Slide 4: Alerts + News + Scheduler
  {
    name: '04-alerts-news',
    html: `<style>${baseStyles()}</style>
    <div class="slide">
      <div class="grid-bg"></div>
      <div class="glow-tl"></div>
      <div class="content">
        <div class="tag">Monitoring</div>
        <h2>Alerts, News<br/>& <span class="green">Scheduling</span></h2>
        <ul class="feature-list">
          <li>
            <div class="feature-icon">&#128276;</div>
            <div><strong style="color:#fff;">Price Alerts</strong><br/><span class="dim">Configurable thresholds with above/below conditions and auto-monitoring</span></div>
          </li>
          <li>
            <div class="feature-icon">&#128240;</div>
            <div><strong style="color:#fff;">News Sentiment</strong><br/><span class="dim">Real-time market news with bullish/bearish scoring per symbol</span></div>
          </li>
          <li>
            <div class="feature-icon purple-icon">&#128197;</div>
            <div><strong style="color:#fff;">Rebalance Scheduler</strong><br/><span class="dim">Timeline visualization with overdue detection and plan integration</span></div>
          </li>
          <li>
            <div class="feature-icon purple-icon">&#128179;</div>
            <div><strong style="color:#fff;">Credits Dashboard</strong><br/><span class="dim">Balance ring, tier info, usage meters, and transaction history</span></div>
          </li>
        </ul>
      </div>
      <div class="watermark">@flowfolio.ai</div>
    </div>`,
  },

  // Slide 5: Stats
  {
    name: '05-stats',
    html: `<style>${baseStyles()}</style>
    <div class="slide">
      <div class="grid-bg"></div>
      <div class="glow-tl"></div>
      <div class="glow-br"></div>
      <div class="content" style="text-align:center; display:flex; flex-direction:column; align-items:center;">
        <div class="tag">By The Numbers</div>
        <h2>v0.2.2 at a Glance</h2>
        <div class="stat-grid" style="margin-top:8px;">
          <div class="stat-card">
            <div class="stat-value">8</div>
            <div class="stat-label">New Components</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:#6366f1;">16</div>
            <div class="stat-label">New Files</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">6</div>
            <div class="stat-label">Critical Bug Fixes</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" style="color:#6366f1;">259</div>
            <div class="stat-label">Tests Passing</div>
          </div>
        </div>
        <div style="margin-top:36px;">
          <p class="subtitle" style="text-align:center;">Lazy-loaded tabs. Dark-mode-first CSS.<br/>Recharts visualizations. Zero runtime errors.</p>
        </div>
      </div>
      <div class="watermark">@flowfolio.ai</div>
    </div>`,
  },

  // Slide 6: CTA
  {
    name: '06-cta',
    html: `<style>${baseStyles()}</style>
    <div class="slide">
      <div class="grid-bg"></div>
      <div class="glow-tl"></div>
      <div class="glow-br"></div>
      <div class="content" style="display:flex; flex-direction:column; align-items:center; text-align:center;">
        <div class="cta-box">
          <div style="display:flex; align-items:center; justify-content:center; gap:16px; margin-bottom:28px;">
            <div class="logo-icon">F</div>
            <span class="logo-text">FlowFolio</span>
          </div>
          <h2 style="margin-bottom:16px;">Your Portfolio.<br/><span class="green">Your Rules.</span></h2>
          <p class="subtitle" style="margin:0 auto 36px;">Privacy-first. AI-powered. Vibe-based.<br/>8 new tools to master your investments.</p>
          <div class="version-badge" style="margin:0 auto;">v0.2.2 &mdash; Download Now</div>
        </div>
        <p style="margin-top:36px; font-size:20px; color:#71717a;">
          <span style="color:#00e599;">github.com/vincrypt/flowfolio</span>
        </p>
      </div>
      <div class="watermark">@flowfolio.ai</div>
    </div>`,
  },
];

// ── Generate slide images ────────────────────────────────

async function generateSlides(): Promise<string[]> {
  console.log('Generating carousel slides...');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1080, height: 1080 },
    deviceScaleFactor: 1,
  });

  const paths: string[] = [];

  for (const slide of slides) {
    const page = await context.newPage();
    await page.setContent(slide.html, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const outPath = path.join(OUTPUT_DIR, `${slide.name}.png`);
    await page.screenshot({ path: outPath, type: 'png' });
    paths.push(outPath);
    console.log(`  Generated: ${slide.name}.png`);
    await page.close();
  }

  await browser.close();
  console.log(`\n${paths.length} slides generated in ${OUTPUT_DIR}\n`);
  return paths;
}

// ── Caption ──────────────────────────────────────────────

const CAPTION = `FlowFolio v0.2.2 -- the biggest feature drop yet.

8 new tabs. One unified command center.

What's new:
- Portfolio Dashboard with sector allocation, top movers, and quick actions
- Risk Dashboard with composite score gauge, VaR, correlation heatmap
- Side-by-side Comparison Mode for any two tickers
- Price Alerts with configurable thresholds and auto-monitoring
- News & Sentiment analysis with bullish/bearish scoring
- Rebalance Scheduler with timeline and overdue detection
- Watchlist Manager for tracking symbols across universes
- Credits Dashboard with balance ring and usage meters

Plus 6 critical backend bug fixes and fully lazy-loaded components.

Built with Rust, React 19, Tauri 2, and Recharts.
Privacy-first. Runs on your machine.

Download: link in bio

#FlowFolio #InvestSmart #QuantTrading #PortfolioManagement #FinTech #RiskAnalysis #TauriApp #RustLang #React #DesktopApp #FactorInvesting #BackTesting #PrivacyFirst #OpenSource #AppDev #InvestmentApp #StockMarket #CodingLife #BuildInPublic #IndieHacker`;

// ── Main ─────────────────────────────────────────────────

async function main() {
  const slidePaths = await generateSlides();

  console.log('Slides generated at:', OUTPUT_DIR);
  console.log('Files:', slidePaths.map(p => path.basename(p)).join(', '));
  console.log('\nCaption:\n');
  console.log(CAPTION);
  console.log('\n---');
  console.log('To post manually, upload the slides from:', OUTPUT_DIR);
}

main().catch(console.error);
