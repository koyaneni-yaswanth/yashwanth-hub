import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';

const require = createRequire(import.meta.url);
const root = process.cwd();

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
  throw new Error('Playwright not found');
}

const { chromium } = loadPlaywright();

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Timeout waiting for vite preview');
}

async function mockApiRoutes(ctx) {
  await ctx.route('**/api/ai/chat**', async (route) => {
    const u = new URL(route.request().url());
    if (u.searchParams.get('action') === 'health') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          providers: [
            { id: 'gemini', name: 'Google Gemini', configured: true, status: 'connected', latencyMs: 112 },
            { id: 'openai', name: 'OpenAI', configured: false, status: 'not_configured', latencyMs: 140 },
          ],
          circuitBreakers: [{ provider: 'gemini', state: 'closed', failures: 0 }],
          vaultEncryptionReady: true,
        }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, tools: [], configuredProviders: { gemini: true } }),
    });
  });
}

async function main() {
  const port = 4177;
  const baseUrl = `http://127.0.0.1:${port}`;
  const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
  const preview = spawn(
    process.execPath,
    [viteBin, 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    { cwd: root, stdio: 'pipe' }
  );

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const useEdge = fs.existsSync(edgePath);
  const errors = [];
  let browser;

  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch({
      headless: true,
      ...(useEdge ? { executablePath: edgePath } : {}),
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        ...(useEdge ? [] : ['--use-gl=angle', '--use-angle=swiftshader']),
      ],
    });

    // 1. Desktop 3D Studio Flow
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await mockApiRoutes(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });

    await page.goto(`${baseUrl}/universe`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="universe-entry-screen"]', { timeout: 12000 });
    await page.click('[data-testid="universe-entry-screen"] button:has-text("START")');
    await page.waitForSelector('[data-testid="universe-webgl-canvas"] canvas', { timeout: 12000 });

    // Interact with monitors & workbench stations via persistent banner
    await page.click('nav[aria-label="Digital Universe Stations"] button:has-text("ABOUT ME")');
    await page.waitForSelector('[data-testid="studio-panel-about"]', { timeout: 8000 });

    await page.click('nav[aria-label="Digital Universe Stations"] button:has-text("PROJECTS")');
    await page.waitForSelector('[data-testid="studio-panel-projects"]', { timeout: 8000 });

    await page.click('nav[aria-label="Digital Universe Stations"] button:has-text("JARVIS CORE")');
    await page.waitForSelector('[data-testid="studio-panel-jarvis"]', { timeout: 8000 });

    await page.click('nav[aria-label="Digital Universe Stations"] button:has-text("SYSTEM / LABS")');
    await page.waitForSelector('[data-testid="studio-panel-research"]', { timeout: 8000 });

    // Whiteboard drawing & persistence
    await page.click('nav[aria-label="Digital Universe Stations"] button:has-text("WHITEBOARD")');
    await page.waitForSelector('[data-testid="studio-whiteboard"] canvas', { timeout: 8000 });
    await page.click('button[aria-label="Blue marker"]');
    const wbBox = await page.locator('[data-testid="studio-whiteboard"] canvas').boundingBox();
    assert.ok(wbBox && wbBox.width > 100);
    await page.mouse.move(wbBox.x + 50, wbBox.y + 50);
    await page.mouse.down();
    await page.mouse.move(wbBox.x + 160, wbBox.y + 110);
    await page.mouse.up();
    await page.click('[data-testid="studio-whiteboard"] button:has-text("Save")');
    await page.waitForSelector('text=Saved locally', { timeout: 6000 });

    // Experiment Console
    await page.click('nav[aria-label="Digital Universe Stations"] button:has-text("EXPERIMENTS")');
    await page.waitForSelector('[data-testid="studio-experiment-console"] canvas', { timeout: 8000 });
    await page.click('button:has-text("2-Link IK")');
    await page.waitForSelector('button:has-text("Branch:")', { timeout: 6000 });
    await page.click('button:has-text("77 GHz Chirp")');

    // Rubik Cube
    await page.click('nav[aria-label="Digital Universe Stations"] button:has-text("RUBIK CUBE")');
    await page.waitForSelector('[data-testid="studio-panel-cube"]', { timeout: 8000 });
    await page.click('button:has-text("Rotate Top (U)")');
    await page.click('button:has-text("Reset Solved")');

    // Robotics Lab & Pawan Shakti 3D CAD Viewers
    await page.goto(`${baseUrl}/?tab=robotics-lab`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="cad-viewer-piper-arm"] canvas', { timeout: 12000 });
    await page.click('[data-testid="cad-viewer-piper-arm"] button:has-text("Wireframe")');

    await page.goto(`${baseUrl}/?tab=startup-command`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("3D Turbine CAD")', { timeout: 12000 });
    await page.click('button:has-text("3D Turbine CAD")');
    await page.waitForSelector('[data-testid="cad-viewer-pawan-turbine"] canvas', { timeout: 12000 });

    await ctx.close();

    // 2. Mobile 390x844 Verification (No mobile lockout + 2D Accessible fallback works)
    const mobCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await mockApiRoutes(mobCtx);
    const mobPage = await mobCtx.newPage();
    mobPage.on('pageerror', (e) => errors.push(`mobile pageerror: ${e.message}`));
    await mobPage.goto(`${baseUrl}/universe`, { waitUntil: 'domcontentloaded' });
    await mobPage.waitForSelector('[data-testid="universe-entry-screen"]', { timeout: 12000 });
    await mobPage.click('button:has-text("Enter 2D Accessible Studio")');
    await mobPage.waitForSelector('text=2D Accessible Studio Mode', { timeout: 8000 });
    const overflow = await mobPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    assert.equal(overflow, false, 'Mobile 390px horizontal overflow detected in /universe');
    await mobCtx.close();

    assert.equal(errors.length, 0, `Unexpected errors: ${errors.join('; ')}`);
    console.log('DIGITAL_UNIVERSE_E2E_PASS', JSON.stringify({ stationsVerified: 7, cadViewersVerified: 2, mobile2DFallback: true, errors: [] }));
  } finally {
    if (browser) await browser.close();
    preview.kill('SIGTERM');
  }
}

main().catch((err) => {
  console.error('DIGITAL_UNIVERSE_E2E_FAIL', err);
  process.exit(1);
});
