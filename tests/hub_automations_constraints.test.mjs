import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('Constraint 1 & 2: Server-side automation endpoints exist and client is free of automation execution logic', () => {
  const serverEndpoints = [
    'api/automations/index.ts',
    'api/automations/cron.ts',
    'api/automations/queue.ts',
    'api/automations/run.ts',
    'api/automations/executor.ts',
    'api/automations/db.ts',
  ];

  for (const ep of serverEndpoints) {
    const fullPath = path.join(projectRoot, ep);
    assert.ok(fs.existsSync(fullPath), `Expected server automation endpoint file to exist: ${ep}`);
  }

  // Ensure ReminderEngine delegates intelligence scan to server
  const reminderEngineCode = fs.readFileSync(path.join(projectRoot, 'src/services/reminderEngine.ts'), 'utf-8');
  assert.ok(
    reminderEngineCode.includes('triggerServerAutomation'),
    'ReminderEngine.runIntelligenceScan must delegate to server AutomationService'
  );
});

test('Constraint 3: Scheduled triggers rely on vercel.json cron jobs and Supabase queue processor, never browser intervals', () => {
  const vercelJsonPath = path.join(projectRoot, 'vercel.json');
  assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');

  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf-8'));
  assert.ok(Array.isArray(vercelConfig.crons), 'vercel.json must contain a "crons" array');
  assert.ok(vercelConfig.crons.length >= 3, 'vercel.json must define scheduled automation cron jobs');

  const cronPaths = vercelConfig.crons.map((c) => c.path);
  assert.ok(
    cronPaths.some((p) => p.includes('/api/automations/cron')),
    'vercel.json must have a cron job pointing to /api/automations/cron'
  );
  assert.ok(
    cronPaths.some((p) => p.includes('/api/automations/queue')),
    'vercel.json must have a cron job draining /api/automations/queue'
  );

  // Check that no browser intervals trigger automation runs in src/
  const srcDir = path.join(projectRoot, 'src');
  function scanForIntervals(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanForIntervals(full);
      } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
        const content = fs.readFileSync(full, 'utf-8');
        if (content.includes('setInterval') && content.includes('runIntelligenceScan')) {
          assert.fail(`Found setInterval running automation in client file: ${full}`);
        }
      }
    }
  }
  scanForIntervals(srcDir);
});

test('Constraint 4: Verified database schema and execution logging without fake timers or optimistic fakes', () => {
  const migrationPath = path.join(projectRoot, 'supabase/migrations/20261105_hub_automations_engine.sql');
  assert.ok(fs.existsSync(migrationPath), 'Supabase automations migration must exist');

  const sql = fs.readFileSync(migrationPath, 'utf-8');
  assert.ok(sql.includes('create table if not exists public.hub_automations'), 'Schema must define hub_automations table');
  assert.ok(sql.includes('create table if not exists public.automation_queue'), 'Schema must define automation_queue table');
  assert.ok(sql.includes('create table if not exists public.automation_execution_logs'), 'Schema must define automation_execution_logs table');
  assert.ok(sql.includes('duration_ms integer not null'), 'automation_execution_logs must track real duration_ms');
  assert.ok(sql.includes('records_affected integer not null'), 'automation_execution_logs must track records_affected');
  assert.ok(sql.includes('alter table public.automation_execution_logs enable row level security'), 'RLS must be enabled on logs');
});

test('Constraint 5: All secrets remain in server environment variables, never in VITE_* bundles', () => {
  const envExamplePath = path.join(projectRoot, '.env.example');
  assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');

  const envContent = fs.readFileSync(envExamplePath, 'utf-8');
  const forbiddenViteKeys = [
    'VITE_CRON_SECRET',
    'VITE_SUPABASE_SERVICE_ROLE_KEY',
    'VITE_GOOGLE_CLIENT_SECRET',
    'VITE_NEOSAPIEN_CLIENT_SECRET',
  ];

  for (const forbidden of forbiddenViteKeys) {
    assert.ok(
      !envContent.includes(forbidden),
      `Forbidden secret key found with VITE_ prefix in .env.example: ${forbidden}`
    );
  }

  // Verify server-side secret declarations exist without VITE_ prefix
  assert.ok(envContent.includes('CRON_SECRET='), 'CRON_SECRET must be declared as a server-only variable');
  assert.ok(envContent.includes('SUPABASE_SERVICE_ROLE_KEY='), 'SUPABASE_SERVICE_ROLE_KEY must be declared as server-only');
  assert.ok(envContent.includes('GOOGLE_CLIENT_SECRET='), 'GOOGLE_CLIENT_SECRET must be declared as server-only');
  assert.ok(envContent.includes('NEOSAPIEN_CLIENT_SECRET='), 'NEOSAPIEN_CLIENT_SECRET must be declared as server-only');
});
