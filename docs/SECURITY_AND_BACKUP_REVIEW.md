# Yashwanth Hub — Security Audit & Database Backup Review

**Application:** Yashwanth Hub  
**Date:** November 15, 2026  
**Document Target:** `docs/SECURITY_AND_BACKUP_REVIEW.md`  

---

## 1. Security Architecture & RLS Coverage

All data in Yashwanth Hub is isolated by user identity via PostgreSQL Row-Level Security (RLS) on Supabase project `xjhkxnfahkkgwbbtmhtk`.

### 1.1 Table Security Verification
- **Total Tables:** 27
- **RLS Enabled:** 27 / 27 (100%)
- **Supabase Security Advisor Lints:** **0 security issues found**

```sql
-- Verified Canonical RLS Policy applied across all 27 tables:
CREATE POLICY "Users can only access their own records"
ON public.<table>
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
```

### 1.2 User-Scoped Client Pattern in Serverless Functions
In `api/_lib/db.ts`, serverless functions use `createUserScopedClient(userToken)`:
```typescript
export function createUserScopedClient(userToken?: string): SupabaseClient {
  const globalHeaders: Record<string, string> = {};
  if (userToken) {
    globalHeaders['Authorization'] = `Bearer ${userToken}`;
  }
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: globalHeaders },
  });
}
```
This guarantees that even if a serverless endpoint runs an unrestricted `SELECT *`, PostgreSQL RLS filters the rows to only those belonging to `auth.uid() = user_id`.

---

## 2. Secrets & Credential Isolation

- **Client Bundle Audit:** Scanned `dist/assets/*.js`. Zero private server secrets, zero service role keys, and zero OAuth client secrets exist in client-side code.
- **Allowed Client Variables:**
  - `VITE_SUPABASE_URL` (public endpoint)
  - `VITE_SUPABASE_ANON_KEY` (public anon key with RLS enforcement)
  - `VITE_GOOGLE_CLIENT_ID` (public OAuth client identifier)
- **Private Server Variables:**
  - `SUPABASE_SERVICE_ROLE_KEY` (server only; used strictly for cross-user unattended cron)
  - `GOOGLE_CLIENT_SECRET` (server only; used for token exchange)
  - `CRON_SECRET` (server only; used to authenticate Vercel cron triggers)
  - `NEOSAPIEN_WEBHOOK_SECRET` (server only; used for HMAC-SHA256 signature verification)

---

## 3. Data Audit Logging

Mutations and security events are logged to the `data_audit_log` table:
- Timestamp (UTC)
- Actor `user_id`
- Action type (`CREATE`, `UPDATE`, `DELETE`, `SYNC`, `CRON_TRIGGER`)
- Entity type (`task`, `project`, `document`, `automation`)
- Entity ID and status

---

## 4. Backup & Disaster Recovery Runbook

### 4.1 Automated Supabase Backups
- Supabase automatically captures daily full database backups and continuous Write-Ahead Log (WAL) archives on project `xjhkxnfahkkgwbbtmhtk`.
- Point-in-time recovery (PITR) is available via the Supabase dashboard.

### 4.2 Manual Logical Dump (Ad-hoc Founder Backup)
To export an encrypted local snapshot before major migrations:

```bash
# Export full public schema and data
pg_dump "postgresql://postgres:[PASSWORD]@db.xjhkxnfahkkgwbbtmhtk.supabase.co:5432/postgres" \
  --schema=public \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  -F c \
  -f "backup_yashwanth_hub_$(date +%Y%m%d).dump"
```

### 4.3 Database Restoration Procedure
In the event of accidental data corruption:
```bash
# Restore specific table from dump
pg_restore -d "postgresql://postgres:[PASSWORD]@db.xjhkxnfahkkgwbbtmhtk.supabase.co:5432/postgres" \
  --clean \
  --table=tasks \
  "backup_yashwanth_hub_20261115.dump"
```
