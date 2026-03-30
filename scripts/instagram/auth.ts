import { chromium, Browser, Page, BrowserContext } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORAGE_PATH = path.join(__dirname, '..', '..', '.ig-session.json');

const IG_BASE = 'https://www.instagram.com';

// Realistic delays to avoid bot detection
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms + Math.random() * ms * 0.5));
}

async function humanType(page: Page, selector: string, text: string) {
  await page.click(selector);
  for (const char of text) {
    await page.keyboard.type(char, { delay: 50 + Math.random() * 100 });
  }
}

export async function launchBrowser(): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const browser = await chromium.launch({
    headless: false, // Instagram blocks headless browsers
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  // Load saved session if available
  const hasSession = fs.existsSync(STORAGE_PATH);
  const context = await browser.newContext({
    storageState: hasSession ? STORAGE_PATH : undefined,
    // Use desktop viewport + user agent — mobile triggers stricter bot checks
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'en-US',
  });

  const page = await context.newPage();

  // Mask automation signals
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    // Remove Playwright-specific properties
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
    // Chrome-specific property
    (window as any).chrome = { runtime: {} };
  });

  return { browser, context, page };
}

export async function saveSession(context: BrowserContext) {
  await context.storageState({ path: STORAGE_PATH });
  console.log('Session saved to', STORAGE_PATH);
}

export async function signup(page: Page, opts: {
  email: string;
  fullName: string;
  username: string;
  password: string;
}): Promise<boolean> {
  console.log('Attempting Instagram signup...');
  console.log('Note: Instagram may block automated signups with CAPTCHA/verification');

  try {
    await page.goto(`${IG_BASE}/accounts/emailsignup/`, { waitUntil: 'networkidle' });
    await delay(2000);

    // Accept cookies if dialog appears
    try {
      const cookieBtn = page.locator('button:has-text("Allow"), button:has-text("Accept")');
      if (await cookieBtn.isVisible({ timeout: 3000 })) {
        await cookieBtn.click();
        await delay(1000);
      }
    } catch { /* no cookie dialog */ }

    // Fill signup form
    await humanType(page, 'input[name="emailOrPhone"]', opts.email);
    await delay(800);
    await humanType(page, 'input[name="fullName"]', opts.fullName);
    await delay(800);
    await humanType(page, 'input[name="username"]', opts.username);
    await delay(800);
    await humanType(page, 'input[name="password"]', opts.password);
    await delay(1000);

    // Click Sign Up
    const signupBtn = page.locator('button[type="submit"]:has-text("Sign up"), button:has-text("Next")');
    await signupBtn.click();
    await delay(5000);

    // Check if we hit a challenge (CAPTCHA, phone verification, etc.)
    const currentUrl = page.url();
    if (currentUrl.includes('challenge') || currentUrl.includes('confirm')) {
      console.log('Instagram requires verification (CAPTCHA/phone/email).');
      console.log('   Please complete the verification manually in the browser window...');
      console.log('   Waiting up to 120 seconds...');

      // Wait for user to manually complete verification
      await page.waitForURL('**/instagram.com/**', {
        timeout: 120000,
      }).catch(() => {});
    }

    // Check if signup succeeded
    if (page.url().includes('/accounts/onetap') || page.url() === `${IG_BASE}/`) {
      console.log('Signup successful!');
      return true;
    }

    // Check for error messages
    const errorEl = page.locator('[role="alert"], #ssfErrorAlert');
    if (await errorEl.isVisible({ timeout: 2000 }).catch(() => false)) {
      const errorText = await errorEl.textContent();
      console.log(`Signup failed: ${errorText}`);
      return false;
    }

    console.log('Signup result unclear. Current URL:', page.url());
    return false;
  } catch (err) {
    console.error('Signup error:', (err as Error).message);
    return false;
  }
}

export async function login(page: Page, username: string, password: string): Promise<boolean> {
  console.log('Logging in to Instagram...');

  try {
    // Go to Instagram homepage first, then navigate to login
    await page.goto(IG_BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000);

    // Accept cookies if dialog appears
    try {
      const cookieBtn = page.locator('button:has-text("Allow essential and optional cookies"), button:has-text("Allow"), button:has-text("Accept")');
      if (await cookieBtn.first().isVisible({ timeout: 5000 })) {
        await cookieBtn.first().click();
        await delay(2000);
      }
    } catch { /* no cookie dialog */ }

    // Check if already logged in (from saved session)
    const currentUrl = page.url();
    if (currentUrl === `${IG_BASE}/` || currentUrl === `${IG_BASE}`) {
      // Look for indicators of being logged in (home feed elements)
      try {
        const homeIndicator = page.locator('svg[aria-label="Home"], a[href="/"], svg[aria-label="New post"]');
        if (await homeIndicator.first().isVisible({ timeout: 5000 })) {
          console.log('Already logged in from saved session!');
          return true;
        }
      } catch { /* not logged in */ }
    }

    // Navigate to login page
    await page.goto(`${IG_BASE}/accounts/login/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await delay(3000);

    // Instagram may redirect to auth_platform — handle both old and new login flows
    const loginUrl = page.url();
    console.log('Login page URL:', loginUrl);

    // Accept cookies again if needed on login page
    try {
      const cookieBtn = page.locator('button:has-text("Allow essential and optional cookies"), button:has-text("Allow"), button:has-text("Accept")');
      if (await cookieBtn.first().isVisible({ timeout: 3000 })) {
        await cookieBtn.first().click();
        await delay(2000);
      }
    } catch { /* no cookie dialog */ }

    // Wait for any login form to appear — try multiple selectors for old and new flows
    const usernameInput = page.locator('input[name="username"], input[aria-label="Phone number, username, or email"], input[autocomplete="username"]').first();

    try {
      await usernameInput.waitFor({ state: 'visible', timeout: 15000 });
    } catch {
      // If no standard form, maybe auth_platform page — look for input fields there
      console.log('Standard login form not found, checking auth_platform...');
      const authInput = page.locator('input[type="text"], input[type="email"]').first();
      try {
        await authInput.waitFor({ state: 'visible', timeout: 10000 });
      } catch {
        console.log('No login form found. Current URL:', page.url());
        console.log('Please complete login manually in the browser window...');
        console.log('Waiting up to 180 seconds...');

        // Wait for user to manually log in
        try {
          await page.waitForURL((url) => {
            const u = url.toString();
            return u === `${IG_BASE}/` || u.includes('/accounts/onetap');
          }, { timeout: 180000 });
          console.log('Login completed manually!');
          return true;
        } catch {
          console.log('Manual login timed out. URL:', page.url());
          return false;
        }
      }
    }

    // Fill login form — use flexible selectors
    const uInput = page.locator('input[name="username"], input[aria-label="Phone number, username, or email"], input[autocomplete="username"]').first();
    const pInput = page.locator('input[name="password"], input[aria-label="Password"], input[autocomplete="current-password"], input[type="password"]').first();

    await uInput.click();
    await delay(300);
    // Clear any existing value
    await uInput.fill('');
    await delay(200);
    for (const char of username) {
      await page.keyboard.type(char, { delay: 40 + Math.random() * 80 });
    }
    await delay(800);

    await pInput.click();
    await delay(300);
    await pInput.fill('');
    await delay(200);
    for (const char of password) {
      await page.keyboard.type(char, { delay: 40 + Math.random() * 80 });
    }
    await delay(1000);

    // Click Log In — try multiple selectors
    const loginBtn = page.locator('button[type="submit"], button:has-text("Log in"), button:has-text("Log In"), div[role="button"]:has-text("Log in")').first();

    try {
      await loginBtn.click();
    } catch {
      // Fallback: press Enter
      await page.keyboard.press('Enter');
    }
    await delay(5000);

    // Handle challenge/verification (CAPTCHA, suspicious login, 2FA, etc.)
    const postLoginUrl = page.url();
    if (postLoginUrl.includes('challenge') || postLoginUrl.includes('auth_platform') || postLoginUrl.includes('two_factor')) {
      console.log('Instagram requires verification. Please complete it in the browser window...');
      console.log('Current URL:', postLoginUrl);
      console.log('Waiting up to 180 seconds...');

      try {
        await page.waitForURL((url) => {
          const u = url.toString();
          return u === `${IG_BASE}/` || u.includes('/accounts/onetap') || (u.includes('instagram.com') && !u.includes('challenge') && !u.includes('auth_platform') && !u.includes('two_factor') && !u.includes('login'));
        }, { timeout: 180000 });
      } catch {
        // Check if we ended up on the feed anyway
        const finalUrl = page.url();
        if (!finalUrl.includes('login') && !finalUrl.includes('challenge') && !finalUrl.includes('auth_platform')) {
          console.log('Login appears successful. URL:', finalUrl);
          return true;
        }
        console.log('Verification timed out. URL:', finalUrl);
        return false;
      }
    }

    // Handle "Save Login Info" prompt
    try {
      const saveInfoBtn = page.locator('button:has-text("Save info"), button:has-text("Save Info")');
      if (await saveInfoBtn.isVisible({ timeout: 5000 })) {
        await saveInfoBtn.click();
        await delay(1000);
      }
    } catch { /* no save prompt */ }

    // Handle "Not Now" prompts (save login, notifications, etc.)
    for (let i = 0; i < 3; i++) {
      try {
        const notNowBtn = page.locator('button:has-text("Not Now"), button:has-text("Not now"), button:has-text("Skip")');
        if (await notNowBtn.first().isVisible({ timeout: 3000 })) {
          await notNowBtn.first().click();
          await delay(1500);
        }
      } catch { break; }
    }

    // Check if login succeeded — broader check
    const finalUrl = page.url();
    const isLoggedIn = finalUrl === `${IG_BASE}/`
      || finalUrl.includes('/accounts/onetap')
      || (!finalUrl.includes('login') && !finalUrl.includes('challenge') && !finalUrl.includes('auth_platform') && finalUrl.includes('instagram.com'));

    if (isLoggedIn) {
      console.log('Login successful!');
      return true;
    }

    console.log('Login result unclear. URL:', finalUrl);
    return false;
  } catch (err) {
    console.error('Login error:', (err as Error).message);
    return false;
  }
}
