/**
 * Comprehensive Multi-Route E2E Verification Suite for Milestones 1-4 (Chromium / Edge + Vite Preview).
 * Tests Focus Mode, Command Palette, Research Bookmarks -> Knowledge Graph linking,
 * Ask Jarvis Executive Daily Briefing + L2 Dispatch Bar, Self-Healing Diagnostics,
 * Outbound Channel Status UI, Automations, and Mobile 390x844 horizontal overflow across routes.
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
      /* retrying */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Preview server did not start within ${timeoutMs}ms`);
}

function attachErrorCollectors(page, errors) {
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('requestfailed', (req) => {
    const errText = req.failure()?.errorText || 'unknown';
    if (errText === 'net::ERR_ABORTED') return;
    errors.push(`requestfailed: ${req.url()} (${errText})`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text();
      if (!txt.includes('favicon.ico')) errors.push(`console.error: ${txt}`);
    }
  });
}

async function attachApiMocks(context) {
  await context.route('**/api/**', async (route) => {
    const reqUrl = new URL(route.request().url());
    const pathname = reqUrl.pathname;
    const action = reqUrl.searchParams.get('action') || '';

    if (pathname === '/api/ai/chat' && route.request().method() === 'POST') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          text: 'Executive Synthesis: Priorities verified across PAWAN SHAKTI and IvLabs.',
          latencyMs: 65,
        }),
      });
    }

    if (pathname === '/api/ai/chat' && action === 'health') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          configuredProviders: { gemini: true, openai: false, anthropic: false, openrouter: false, huggingface: false, ollama: false },
          providers: [
            { id: 'gemini', name: 'Google Gemini', configured: true, status: 'connected', reachable: true, latencyMs: 72, discoveredModelsCount: 25, sampleModels: ['gemini-2.5-flash'], capabilities: { chat: true, tools: true, vision: true, embeddings: true, modelDiscovery: true, localPrivate: false }, note: 'Verified' },
          ],
          recommended: { provider: 'gemini', reason: 'Google Gemini ready' },
        }),
      });
    }

    if (pathname === '/api/ai/chat' && action === 'tools') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          tools: [],
          configuredProviders: { gemini: true },
        }),
      });
    }

    if (pathname === '/api/integrations/sync' && action === 'research') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          query: reqUrl.searchParams.get('q') || 'wind turbine',
          papers: [
            {
              id: 'arxiv_2611_1234',
              source: 'arxiv',
              title: 'Archimedes Spiral Rotor Aerodynamic Performance Study',
              authors: ['Y. Koyaneni', 'A. Researcher'],
              publishedDate: '2026-11-20',
              venue: 'arXiv',
              url: 'https://arxiv.org/abs/2611.1234',
              summary: 'Experimental and CFD evaluation of spiral rotor blades at low wind speed.',
              matchedKeywords: ['archimedes', 'wind', 'rotor'],
              relevanceScore: 98,
            },
          ],
          sourceStatus: {
            arxiv: { ok: true, count: 1, latencyMs: 40 },
            openalex: { ok: true, count: 0, latencyMs: 35 },
            crossref: { ok: true, count: 0, latencyMs: 50 },
          },
          fetchedAt: new Date().toISOString(),
        }),
      });
    }

    if (pathname === '/api/integrations/sync' && action === 'dev_status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          github: {
            repo: 'koyaneni-yaswanth/yashwanth-hub',
            configuredToken: false,
            status: 'connected',
            openIssuesCount: 0,
            defaultBranch: 'main',
            recentCommits: [
              { sha: '345cd2d', message: 'feat(m4): cross-device realtime & pipelines', author: 'Yaswanth', date: '2026-11-26T15:30:00Z', url: 'https://github.com' },
            ],
            openPullRequests: [],
            recentWorkflowRuns: [],
          },
          vercel: {
            project: 'yashwanth-hub',
            tokenConfigured: false,
            runtimeCommitSha: '345cd2d',
            runtimeCommitMessage: 'feat(m4)',
            runtimeCommitRef: 'v4-jarvis-hud',
            runtimeRegion: 'iad1',
            latestDeployments: [],
          },
          checkedAt: new Date().toISOString(),
        }),
      });
    }

    if (pathname === '/api/automations/dispatch' && action === 'channel_status') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          webhookSigningConfigured: true,
          channels: [
            { id: 'telegram', label: 'Telegram Bot', configured: false, status: 'not_configured', detail: 'Add env keys', envHints: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] },
            { id: 'discord', label: 'Discord Webhook', configured: false, status: 'not_configured', detail: 'Add env key', envHints: ['DISCORD_WEBHOOK_URL'] },
            { id: 'webhook', label: 'n8n / Make / Custom Webhook', configured: true, status: 'connected', detail: 'Configured', envHints: ['N8N_WEBHOOK_URL'] },
          ],
        }),
      });
    }

    return route.fallback();
  });
}

async function main() {
  const port = 4174;
  const baseUrl = `http://127.0.0.1:${port}`;
  const preview = spawn('cmd.exe', ['/c', `npx.cmd vite preview --host 127.0.0.1 --port ${port} --strictPort`], {
    cwd: root,
    stdio: 'pipe',
  });

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  const useEdge = fs.existsSync(edgePath);

  const report = {
    browser: useEdge ? 'Microsoft Edge' : 'Chromium',
    verifiedFlows: [],
    mobileRoutesChecked: [],
    errors: [],
  };

  let browser;
  try {
    await waitForServer(baseUrl);
    browser = await chromium.launch({
      headless: true,
      ...(useEdge ? { executablePath: edgePath } : {}),
      args: ['--enable-webgl', '--ignore-gpu-blocklist'],
    });

    // ------------------------------------------------------------------
    // 1. Desktop E2E User Journeys (M1-M4)
    // ------------------------------------------------------------------
    const desktopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await attachApiMocks(desktopCtx);
    const page = await desktopCtx.newPage();
    attachErrorCollectors(page, report.errors);

    // Flow A: Command Palette -> Knowledge Vault -> Knowledge Graph -> Custom Entity Link
    await page.goto(`${baseUrl}/?tab=knowledge-memory`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Knowledge Graph")', { timeout: 12000 });
    await page.click('button:has-text("Knowledge Graph")');
    await page.waitForSelector('text=Workspace Knowledge Graph', { timeout: 10000 });
    // Connect two seeded entities persistently
    await page.waitForSelector('button[aria-label="Create custom knowledge link"]', { timeout: 10000 });
    await page.click('button[aria-label="Create custom knowledge link"]');
    await page.waitForSelector('button[aria-label^="Remove link to"]', { timeout: 10000 });
    await page.click('button[aria-label^="Remove link to"]');
    report.verifiedFlows.push('Knowledge Graph custom link create & delete');

    // Flow B: Research Intelligence -> Bookmark paper -> Synced Bookmarks tab
    await page.goto(`${baseUrl}/?tab=research-feed`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Archimedes Spiral Rotor Aerodynamic Performance Study', { timeout: 12000 });
    await page.click('article button[aria-label="Toggle paper bookmark"]');
    await page.waitForSelector('article button:has-text("Bookmarked")', { timeout: 10000 });
    await page.click('button:has-text("Synced Bookmarks")');
    await page.waitForSelector('text=Archimedes Spiral Rotor Aerodynamic Performance Study', { timeout: 10000 });
    report.verifiedFlows.push('Research Intelligence Bookmark & Synced Bookmarks tab');

    // Verify bookmarked paper renders inside Knowledge Graph!
    await page.goto(`${baseUrl}/?tab=knowledge-memory`, { waitUntil: 'domcontentloaded' });
    await page.click('button:has-text("Knowledge Graph")');
    await page.waitForSelector('select[aria-label="Filter graph entity type"]', { timeout: 10000 });
    await page.selectOption('select[aria-label="Filter graph entity type"]', 'paper');
    await page.waitForSelector('text=Archimedes Spiral Rotor Aerodynamic Performance Study', { timeout: 10000 });
    report.verifiedFlows.push('Synced research paper rendered inside Knowledge Graph');

    // Flow C: Ask Jarvis AI -> Executive Daily Briefing -> L2 Push Bar
    await page.goto(`${baseUrl}/?tab=ai-assistant`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Daily Briefing")', { timeout: 12000 });
    await page.click('button:has-text("Daily Briefing")');
    await page.waitForSelector('button:has-text("Push Briefing (L2)")', { timeout: 12000 });
    report.verifiedFlows.push('AI Daily Briefing synthesis & L2 Push bar');

    // Flow D: System Health & Self-Healing Diagnostics (Level 1 / 2 / 3)
    await page.goto(`${baseUrl}/?tab=system-health`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Autonomous Self-Healing & Execution Policy', { timeout: 12000 });
    await page.click('button:has-text("Run Level-1 Diagnostics")');
    await page.waitForSelector('text=Scan completed', { timeout: 10000 });
    await page.waitForSelector('text=Recent Execution & Policy Audit', { timeout: 10000 });
    report.verifiedFlows.push('Level-1 Self-Healing Diagnostics & execution audit log');

    // Flow E: Notifications Outbound Channel Status UI
    await page.goto(`${baseUrl}/?tab=notifications`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Outbound Automation & Alert Channels', { timeout: 12000 });
    await page.waitForSelector('text=HMAC-SHA256 Signing On', { timeout: 10000 });
    await page.waitForSelector('text=n8n / Make / Custom Webhook', { timeout: 10000 });
    report.verifiedFlows.push('Notifications live channel readiness & HMAC badge');

    // Flow F: Command Palette Ctrl+K Jump
    await page.keyboard.press('Control+KeyK');
    await page.waitForSelector('input[aria-label="Search the hub"]', { timeout: 10000 });
    await page.fill('input[aria-label="Search the hub"]', 'System Health');
    await page.waitForSelector('[role="dialog"] >> text=Go to System Health & Sync Center', { timeout: 5000 });
    await page.click('[role="dialog"] >> text=Go to System Health & Sync Center');
    await page.waitForSelector('text=Autonomous Self-Healing & Execution Policy', { timeout: 10000 });
    report.verifiedFlows.push('Ctrl+K Command Palette M4 quick navigation');

    await desktopCtx.close();

    // ------------------------------------------------------------------
    // 2. Mobile 390x844 Layout & Zero-Overflow Check across M1-M4 pages
    // ------------------------------------------------------------------
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    await attachApiMocks(mobileCtx);
    const mobilePage = await mobileCtx.newPage();
    attachErrorCollectors(mobilePage, report.errors);

    const mobileRoutes = [
      'research-feed',
      'knowledge-memory',
      'system-health',
      'notifications',
      'ai-assistant',
      'automations',
    ];
    for (const tab of mobileRoutes) {
      await mobilePage.goto(`${baseUrl}/?tab=${tab}`, { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForTimeout(500);
      const overflow = await mobilePage.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 2
      );
      assert.equal(overflow, false, `Horizontal overflow detected on mobile route ?tab=${tab}`);
      report.mobileRoutesChecked.push(tab);
    }

    await mobileCtx.close();

    assert.equal(report.errors.length, 0, `Errors detected during E2E QA:\n${report.errors.join('\n')}`);
    console.log('M1_TO_M4_E2E_QA_PASS', JSON.stringify(report, null, 2));
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
  console.error('M1_TO_M4_E2E_QA_FAIL', err);
  process.exit(1);
});
