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
