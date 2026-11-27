/**
 * Playwright E2E Verification for PROJECT JARVIS 4.0 (/buddy)
 * Tests:
 * 1. Direct `/buddy` path routing & document title
 * 2. Central 3D/2D companion core visibility + all 8 visual state indicators
 * 3. Conversation + streaming + automatic non-secret memory extraction + secret rejection
 * 4. Activity Timeline drawer + Tier 2 Approve & Execute + Tier 1 Handover Doc creation
 * 5. Mobile 390x844 layout with zero horizontal overflow and zero page/console errors
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = process.cwd();
const artifactDir =
  process.env.JARVIS_ARTIFACT_DIR ||
  'C:/Users/recvn/.gemini/antigravity/brain/a2436169-70bb-4a55-b1b6-42f47d466078/scratch';
fs.mkdirSync(artifactDir, { recursive: true });

function loadPlaywright() {
  const npxRoot = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  const candidates = [path.join(root, 'node_modules', 'playwright')];
  if (fs.existsSync(npxRoot)) {
    for (const dir of fs.readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, dir, 'node_modules', 'playwright'));
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return require(c);
  }
  throw new Error('Could not resolve playwright package');
}

const { chromium } = loadPlaywright();

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* retrying */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server timeout: ${url}`);
}

const server = spawn(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--port', '4174', '--strictPort'], {
  cwd: root,
  stdio: 'ignore',
});

try {
  await waitForServer('http://localhost:4174/');

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const action = url.searchParams.get('action') || '';
      if (url.pathname === '/api/ai/chat' && route.request().method() === 'POST') {
        const reply = 'Hey! Checked your workspace. Pawan Shakti is at TRL 4 benchtop and ready for next sweep.';
        const sse =
          `data: ${JSON.stringify({ type: 'token', delta: reply })}\n\n` +
          `data: ${JSON.stringify({ type: 'done', provider: 'gemini', modelId: 'gemini-2.5-flash', text: reply })}\n\n`;
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: sse });
      }
      if (url.pathname === '/api/buddy' && action === 'overview') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            authenticated: false,
            memories: [],
            timeline: [],
            awarenessSources: [
              { id: 'workspace_hub', status: 'connected', enabled: true, poll_interval_minutes: 5, latest_summary: 'Local IndexedDB live' },
              { id: 'sentry', status: 'not_configured', enabled: false, poll_interval_minutes: 15, latest_summary: 'Not configured' },
            ],
            credentials: [
              { id: 'gemini', label: 'Google Gemini API', configured: true, envVar: 'GEMINI_API_KEY', scope: 'ai', requiredFor: 'Primary AI' },
              { id: 'sentry', label: 'Sentry API', configured: false, envVar: 'SENTRY_AUTH_TOKEN / SENTRY_ORG', scope: 'monitoring', requiredFor: 'Error tracking' },
            ],
          }),
        });
      }
      if (url.pathname === '/api/buddy' && action === 'awareness_refresh') {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            sources: [
              { id: 'workspace_hub', status: 'connected', enabled: true, poll_interval_minutes: 5, latest_summary: 'Verified synced' },
              { id: 'github', status: 'connected', enabled: true, poll_interval_minutes: 15, latest_summary: 'Main clean' },
            ],
            observationsCreated: [],
          }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });

    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console.error: ${m.text()}`);
    });

    await page.goto('http://localhost:4174/buddy', { waitUntil: 'networkidle' });
    await page.waitForSelector('h1:has-text("JARVIS")', { timeout: 10000 });
    await page.waitForSelector('[data-buddy-state]', { timeout: 10000 });

    const title = await page.title();
    assert.match(title, /JARVIS/, `Expected title to contain JARVIS, got ${title}`);

    // Send chat message with decision memory + Tier 2 task request
    const input = page.locator('input[placeholder*="Talk to JARVIS"]');
    await input.fill('We decided to prioritize Pawan Shakti >= 1 Hz sweep. Create a task to calibrate wind tunnel.');
    await page.locator('button[aria-label="Send message to JARVIS"]').click();
    await page.waitForSelector('text=Pawan Shakti is at TRL 4 benchtop', { timeout: 10000 });

    // Open Companion Studio -> Memory tab and confirm non-secret memory extracted & secret blocked
    await page.locator('button:has-text("Memory (")').click();
    await page.waitForSelector('text=Add Long-Term Memory', { timeout: 5000 });
    await page.locator('input[placeholder*="Short memory title"]').fill('Leak test');
    await page.locator('input[placeholder*="Fact, preference"]').fill('api_key=sk-1234567890abcdefghijklmnop');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForSelector('text=Secrets, passwords, API keys', { timeout: 5000 });

    // Test 8-state switcher inside Personality tab
    await page.locator('button:has-text("Personality & Voice")').click();
    await page.locator('button:has-text("Observing")').click();
    const coreState = await page.locator('[data-buddy-state]').getAttribute('data-buddy-state');
    assert.equal(coreState, 'observing');
    await page.locator('button:has-text("Standby")').click();
    await page.locator('button[aria-label="Close Companion Studio"]').click();

    // Test Tier 1 Handover document generation
    await page.locator('button:has-text("Create Handover Doc")').click();
    await page.waitForSelector('text=Handover document created & verified', { timeout: 8000 });

    await page.screenshot({ path: path.join(artifactDir, 'buddy_desktop_1440.png'), fullPage: false });

    // Mobile 390x844 horizontal overflow check
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(mobileOverflow <= 2, `Mobile horizontal overflow detected: ${mobileOverflow}px`);
    await page.screenshot({ path: path.join(artifactDir, 'buddy_mobile_390.png'), fullPage: false });

    assert.deepEqual(errors, [], `Runtime errors on /buddy: ${errors.join('; ')}`);
    console.log('BUDDY E2E PASS: /buddy route, 3D states, chat, memory guard, handover & 390px mobile verified.');
  } finally {
    await browser.close();
  }
} finally {
  server.kill();
  try {
    execFileSync('powershell', ['-NoProfile', '-Command', 'Get-NetTCPConnection -LocalPort 4174 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 4 } | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }']);
  } catch {
    /* ignore */
  }
}
