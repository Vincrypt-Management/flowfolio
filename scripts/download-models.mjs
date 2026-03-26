#!/usr/bin/env node
// Download bundled GGUF models into src-tauri/models/ before a Tauri build.
// Idempotent — skips files that already exist with a non-trivial size.

import { createWriteStream, existsSync, statSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.join(__dirname, '..');
const MODEL_DIR = path.join(ROOT, 'src-tauri', 'models');

const MODELS = [
  {
    filename : 'gemma-3-1b-it-Q4_K_M.gguf',
    url      : 'https://huggingface.co/bartowski/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
    sizeMB   : 700,
  },
];

async function downloadFile(url, dest, label) {
  console.log(`[models] Downloading ${label} (~${MODELS.find(m => m.url === url)?.sizeMB ?? '?'} MB)...`);

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);

  const total      = Number(response.headers.get('content-length') || 0);
  let   downloaded = 0;
  let   lastPct    = 0;

  const writer = createWriteStream(dest);
  const reader = response.body.getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    writer.write(Buffer.from(value));
    downloaded += value.length;

    if (total > 0) {
      const pct = Math.floor(downloaded * 100 / total);
      if (pct >= lastPct + 10) {
        process.stdout.write(
          `\r[models] ${pct}%  (${(downloaded / 1_048_576).toFixed(0)} / ${(total / 1_048_576).toFixed(0)} MB)   `
        );
        lastPct = pct;
      }
    }
  }

  await new Promise((res, rej) => writer.end(err => (err ? rej(err) : res())));
  process.stdout.write('\n');
  console.log(`[models] Saved → ${dest} (${(downloaded / 1_048_576).toFixed(0)} MB)`);
}

async function main() {
  mkdirSync(MODEL_DIR, { recursive: true });

  for (const { filename, url, sizeMB } of MODELS) {
    const dest = path.join(MODEL_DIR, filename);

    if (existsSync(dest)) {
      const { size } = statSync(dest);
      // Treat anything over 10 MB as a complete file
      if (size > 10 * 1_048_576) {
        console.log(`[models] ${filename} already present (${(size / 1_048_576).toFixed(0)} MB) — skip.`);
        continue;
      }
      // Partial download — delete and re-fetch
      console.log(`[models] ${filename} looks incomplete (${(size / 1_048_576).toFixed(0)} MB) — re-downloading.`);
    }

    await downloadFile(url, dest, filename);
  }

  console.log('[models] All models ready.');
}

main().catch(err => {
  console.error('[models] FAILED:', err.message);
  process.exit(1);
});
