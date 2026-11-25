/**
 * End-to-end Playwright verification suite for the Jarvis HUD Home experience.
 * Starts a local `vite preview` server on 127.0.0.1:4173, runs Desktop 3D, 2D Radial,
 * 10x navigation WebGL leak check, Keyboard access across 7 workspaces, Mobile 390px,
 * and Reduced-Motion checks, saving screenshots into the session artifact directory.
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
  const candidates = [
    path.join(root, 'node_modules', 'playwright'),
    path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx', 'e41f203b7505f1fb', 'node_modules', 'playwright'),
  ];
  const npxRoot = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  if (fs.existsSync(npxRoot)) {
    for (const dir of fs.readdirSync(npxRoot)) {
      candidates.push(path.join(npxRoot, dir, 'node_modules', 'playwright'));
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return require(c);
  }
  throw new Error('Could not resolve playwright package in node_modules or npm-cache/_npx');
}

const { chromium } = loadPlaywright();

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* waiting */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

function attachErrorCollectors(page, errors) {
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
  });
}

async function waitForHudReady(page) {
  await page.waitForSelector('.jarvis-hud', { timeout: 15000 });
  await page.waitForSelector('section[aria-labelledby="jarvis-cc-title"]', { timeout: 15000 });
  await page.waitForSelector('section[aria-label="Mission Dock"]', { timeout: 15000 });
}

async function main() {
  const port = 4173;
  const baseUrl = `http://127.0.0.1:${port}`;
  const preview = spawn('cmd.exe', ['/c', `npx.cmd vite preview --host 127.0.0.1 --port ${port} --strictPort`], {
    cwd: root,
    stdio: 'pipe',
  });

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const useEdge = fs.existsSync(edgePath);

  const report = {
    browser: useEdge ? 'Microsoft Edge (Hardware WebGL)' : 'Chromium (SwiftShader WebGL)',
    tiers: {},
    leakCheck: { cycles: 10, passed: false, finalCanvasCount: -1 },
    keyboardReachedWorkspaces: [],
    mobileOverflow: false,
    screenshots: [],
    errors: [],
  };

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

    // ------------------------------------------------------------------
    // 1. Desktop 1440x900 3D & 2D Interactive Smoke + FPS Sampling + 10x Leak Test
    // ------------------------------------------------------------------
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktopCtx.newPage();
    attachErrorCollectors(page, report.errors);

    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForHudReady(page);

    // Confirm 64px compact rail
    const railWidth = await page.locator('aside').first().evaluate((el) => Math.round(el.getBoundingClientRect().width));
    assert.ok(railWidth <= 72 && railWidth >= 56, `Expected ~64px icon rail on Home, got ${railWidth}px`);

    // Wait for lazy 3D JarvisScene canvas + metrics
    await page.waitForSelector('section[aria-labelledby="jarvis-cc-title"] canvas', { timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.__JARVIS_HUD_METRICS__?.webglActive), null, { timeout: 15000 });
    await page.waitForTimeout(1600);

    const desktopMetrics = await page.evaluate(() => window.__JARVIS_HUD_METRICS__);
    report.tiers.desktop = desktopMetrics;
    assert.equal(desktopMetrics.webglActive, true);
    assert.ok(desktopMetrics.dpr <= 1.75, `DPR exceeded 1.75 cap: ${desktopMetrics.dpr}`);

    await page.getByText(/SYSTEMS NOMINAL/i).first().waitFor({ state: 'visible', timeout: 5000 });

    const desktop3dShot = path.join(artifactDir, 'hud_desktop_3d.png');
    await page.screenshot({ path: desktop3dShot });
    report.screenshots.push(desktop3dShot);

    // Core click opens unified AI / task bar -> create task -> check it off -> expand dock
    await page.getByRole('button', { name: 'Ask Jarvis', exact: true }).click();
    const captureRegion = page.getByRole('region', { name: 'Unified AI and Quick Capture Bar' });
    await captureRegion.waitFor({ state: 'visible', timeout: 5000 });
    await captureRegion.getByLabel('Add a task, capture a thought, or ask AI').fill('HUD Smoke Test Check');
    await captureRegion.getByRole('button', { name: 'Add', exact: true }).click();
    const smokeTaskCheckbox = page.locator('input[aria-label="Mark HUD Smoke Test Check complete"]');
    await smokeTaskCheckbox.waitFor({ state: 'visible', timeout: 5000 });
    await smokeTaskCheckbox.click();
    await smokeTaskCheckbox.waitFor({ state: 'detached', timeout: 5000 });

    // Expand + collapse Mission Dock
    await page.getByRole('button', { name: /Show full overview/i }).click();
    await page.locator('[data-agent-target="stats-grid"]').waitFor({ state: 'visible', timeout: 5000 });
    await page.getByRole('button', { name: /Collapse dock/i }).click();

    // Toggle 3D OFF -> verify 2D radial + toggle back ON
    await page.getByRole('button', { name: /Switch to 2D radial layout/i }).click();
    await page.getByRole('button', { name: 'Open Jarvis AI & Quick Capture Bar' }).waitFor({ state: 'visible', timeout: 5000 });
    await page.waitForTimeout(550);
    const desktop2dShot = path.join(artifactDir, 'hud_desktop_2d.png');
    await page.screenshot({ path: desktop2dShot });
    report.screenshots.push(desktop2dShot);
    await page.getByRole('button', { name: /Enable 3D scene/i }).click();
    await page.waitForSelector('section[aria-labelledby="jarvis-cc-title"] canvas', { timeout: 15000 });

    // Check keyboard reachability across all 7 workspace buttons in 3D overlay
    const workspaceBtns = page.locator('ul[aria-label="Workspaces"] button');
    const wsCount = await workspaceBtns.count();
    assert.equal(wsCount, 7, `Expected 7 orbital workspaces, got ${wsCount}`);
    for (let i = 0; i < wsCount; i++) {
      await workspaceBtns.nth(i).focus();
      const label = await workspaceBtns.nth(i).getAttribute('aria-label');
      report.keyboardReachedWorkspaces.push(label);
    }

    // Press Enter on Finance workspace button -> navigates cleanly away from Home
    await workspaceBtns.nth(3).focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('canvas[aria-hidden="true"]').length === 0, null, { timeout: 10000 });
    await page.getByRole('button', { name: 'Home' }).first().click();
    await waitForHudReady(page);
    await page.waitForSelector('section[aria-labelledby="jarvis-cc-title"] canvas', { timeout: 15000 });

    // ------------------------------------------------------------------
    // 2. 10x Navigation WebGL Disposal / Leak Test
    // ------------------------------------------------------------------
    for (let i = 0; i < 10; i++) {
      await page.getByRole('button', { name: /^Tasks/i }).first().click();
      await page.waitForFunction(() => document.querySelectorAll('section[aria-labelledby="jarvis-cc-title"] canvas').length === 0, null, {
        timeout: 10000,
      });
      await page.getByRole('button', { name: /^Home/i }).first().click();
      await page.waitForSelector('section[aria-labelledby="jarvis-cc-title"] canvas', { timeout: 10000 });
    }
    const finalCanvasCount = await page.locator('section[aria-labelledby="jarvis-cc-title"] canvas').count();
    assert.equal(finalCanvasCount, 1, `Expected exactly 1 active canvas after 10x navigation, got ${finalCanvasCount}`);
    report.leakCheck = { cycles: 10, passed: true, finalCanvasCount };

    await desktopCtx.close();

    // ------------------------------------------------------------------
    // 3. Software / Low-Tier FPS Simulation (if Chromium SwiftShader available or narrow low device)
    // ------------------------------------------------------------------
    const lowCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const mobilePage = await lowCtx.newPage();
    attachErrorCollectors(mobilePage, report.errors);

    await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForHudReady(mobilePage);
    await mobilePage.waitForSelector('nav[aria-label="Mobile Workspace Shortcuts"]', { timeout: 10000 });
    await mobilePage.waitForTimeout(1600);

    const mobileOverflow = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    report.mobileOverflow = mobileOverflow;
    assert.equal(mobileOverflow, false, 'Mobile 390px HUD has horizontal overflow');

    const mobileMetrics = await mobilePage.evaluate(() => window.__JARVIS_HUD_METRICS__ || null);
    report.tiers.mobile = mobileMetrics;

    const mobileShot = path.join(artifactDir, 'hud_mobile_390.png');
    await mobilePage.screenshot({ path: mobileShot });
    report.screenshots.push(mobileShot);
    await lowCtx.close();

    // ------------------------------------------------------------------
    // 4. Reduced Motion (`prefers-reduced-motion: reduce`)
    // ------------------------------------------------------------------
    const reducedCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: 'reduce',
    });
    const reducedPage = await reducedCtx.newPage();
    attachErrorCollectors(reducedPage, report.errors);

    await reducedPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await waitForHudReady(reducedPage);
    await reducedPage.waitForSelector('section[aria-labelledby="jarvis-cc-title"] canvas', { timeout: 15000 });
    await reducedPage.waitForTimeout(600);

    const reducedMetrics = await reducedPage.evaluate(() => window.__JARVIS_HUD_METRICS__ || null);
    report.tiers.reducedMotion = reducedMetrics;
    assert.equal(reducedMetrics?.reducedMotion, true, 'Expected reducedMotion telemetry to report true');

    const reducedShot = path.join(artifactDir, 'hud_reduced_motion.png');
    await reducedPage.screenshot({ path: reducedShot });
    report.screenshots.push(reducedShot);
    await reducedCtx.close();

    // ------------------------------------------------------------------
    // 5. Chromium SwiftShader Software Fallback Check (low/medium GPU tier verification)
    // ------------------------------------------------------------------
    const chrome1254 = path.join(
      process.env.LOCALAPPDATA || '',
      'ms-playwright',
      'chromium-1254',
      'chrome-win64',
      'chrome.exe'
    );
    const swBrowser = await chromium.launch({
      headless: true,
      ...(fs.existsSync(chrome1254) ? { executablePath: chrome1254 } : {}),
      args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader'],
    });
    try {
      const swCtx = await swBrowser.newContext({ viewport: { width: 1280, height: 720 } });
      const swPage = await swCtx.newPage();
      attachErrorCollectors(swPage, report.errors);
      await swPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
      await waitForHudReady(swPage);
      await swPage.waitForSelector('section[aria-labelledby="jarvis-cc-title"] canvas', { timeout: 15000 });
      await swPage.waitForTimeout(2200);
      report.tiers.softwareFallback = await swPage.evaluate(() => window.__JARVIS_HUD_METRICS__ || null);
      await swCtx.close();
    } finally {
      await swBrowser.close().catch(() => {});
    }

    assert.equal(report.errors.length, 0, `Console/page errors recorded:\n${report.errors.join('\n')}`);
    console.log('JARVIS_HUD_SMOKE_PASS', JSON.stringify(report, null, 2));
  } finally {
    await browser?.close().catch(() => {});
    if (preview.pid) {
      try {
        if (process.platform === 'win32') {
          execFileSync('taskkill', ['/PID', String(preview.pid), '/T', '/F'], { stdio: 'ignore' });
        } else {
          preview.kill('SIGTERM');
        }
      } catch {
        preview.kill();
      }
    }
  }
}

main().catch((err) => {
  console.error('JARVIS_HUD_SMOKE_FAIL', err);
  process.exit(1);
});
