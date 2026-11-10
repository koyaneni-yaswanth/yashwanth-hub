import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

test('Vercel Hobby Limits: serverless functions under api/ do not exceed 12', () => {
  const apiFiles = [];
  function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '_lib') continue;
        walk(full);
      } else if (entry.name.endsWith('.ts')) {
        apiFiles.push(full);
      }
    }
  }
  walk(path.join(root, 'api'));
  assert.ok(apiFiles.length <= 12, `Expected <= 12 Vercel serverless functions, found ${apiFiles.length}: ${apiFiles.join(', ')}`);
});

test('Security Hygiene: zero private server secrets inside client src/ or exposed VITE_ prefixes', () => {
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf-8');
  for (const forbidden of ['VITE_SUPABASE_SERVICE_ROLE_KEY', 'VITE_GOOGLE_CLIENT_SECRET', 'VITE_CRON_SECRET', 'VITE_GEMINI_API_KEY']) {
    assert.ok(!envExample.includes(forbidden), `Forbidden client-exposed var found in .env.example: ${forbidden}`);
  }

  function scanSrc(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) scanSrc(full);
      else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const text = fs.readFileSync(full, 'utf-8');
        assert.ok(
          !/process\.env\.(SUPABASE_SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET|CRON_SECRET)|import\.meta\.env\.VITE_(SUPABASE_SERVICE_ROLE_KEY|GOOGLE_CLIENT_SECRET|CRON_SECRET|GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY)/.test(
            text
          ),
          `Client code MUST NOT read server secrets or VITE_ secret keys: ${full}`
        );
      }
    }
  }
  scanSrc(path.join(root, 'src'));
});

test('NeoSapien MCP Honesty: removed fabricated DEFAULT_NEOSAPIEN_TOOLS fallback from api/neosapien/mcp.ts', () => {
  const mcpCode = fs.readFileSync(path.join(root, 'api/neosapien/mcp.ts'), 'utf-8');
  assert.ok(!mcpCode.includes('DEFAULT_NEOSAPIEN_TOOLS'), 'Fabricated DEFAULT_NEOSAPIEN_TOOLS fallback must remain removed');
});

test('Android Capacitor Integrity: valid notification icon ic_stat_hub exists and invalid sample ref removed', () => {
  const drawablePath = path.join(root, 'android/app/src/main/res/drawable/ic_stat_hub.xml');
  assert.ok(fs.existsSync(drawablePath), 'Missing Android notification drawable ic_stat_hub.xml');

  const capConfig = fs.readFileSync(path.join(root, 'capacitor.config.ts'), 'utf-8');
  const capService = fs.readFileSync(path.join(root, 'src/services/native/capacitorService.ts'), 'utf-8');
  assert.ok(!capConfig.includes('ic_stat_icon_config_sample'), 'Removed invalid sample icon from capacitor.config.ts');
  assert.ok(!capService.includes('ic_stat_icon_config_sample'), 'Removed invalid sample icon from capacitorService.ts');
  assert.ok(!capService.includes("sound: 'beep.wav'"), 'Removed non-existent beep.wav sound reference');
});

test('Truthfulness Baseline: no unverified ANRF ₹25L secured grant or hardcoded ₹18.5L cash balance in active UI/seeds', () => {
  const targets = [
    'src/db/index.ts',
    'src/pages/StartupCommandPage.tsx',
    'src/pages/FinancePage.tsx',
    'src/pages/DashboardPage.tsx',
  ];
  for (const rel of targets) {
    const content = fs.readFileSync(path.join(root, rel), 'utf-8');
    assert.ok(!content.includes('ANRF R&D Grant Secured'), `Removed unverified secured grant claim from ${rel}`);
    assert.ok(!content.includes('Secured ANRF'), `Removed unverified ANRF secured claim from ${rel}`);
    assert.ok(!content.includes('1850000'), `Removed hardcoded 1850000 cash balance from ${rel}`);
    assert.ok(!content.includes('Small Wind Turbine TRL 6 Prototype Demonstration'), `Updated fake TRL 6 done seed in ${rel}`);
  }
});
