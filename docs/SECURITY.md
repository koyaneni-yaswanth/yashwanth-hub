# Yashwanth Hub — Security Architecture & Threat Model

## 1. Security Philosophy & Principles
Yashwanth Hub enforces an institutional security architecture designed to safeguard proprietary intellectual property (Pawan Shakti wind turbine IP, AgileX robotics source code, ANRF grant financials) and personal credentials:

1. **Defense in Depth**: Security controls operate across the client sandbox, serverless proxy layer, and database row level.
2. **Zero Client Secret Storage**: Third-party API keys and OAuth client secrets are never bundled into compiled client artifacts.
3. **Explicit Human Consent for Side Effects**: Autonomous agents cannot mutate core records or external services without explicit founder approval.

---

## 2. Threat Model & Mitigation Matrix

| Threat Category | Potential Vector | Mitigation Applied in Yashwanth Hub |
| :--- | :--- | :--- |
| **API Key Theft** | Reverse engineering Vite production JS bundles | Environment variables with prefix `VITE_` contain ONLY public keys (e.g. Supabase anon key). AI provider keys (Gemini, OpenAI, Claude) and Google client secrets are processed via serverless functions or local user storage. |
| **Unauthorized DB Access** | Direct access to Supabase PostgreSQL REST endpoints | Row Level Security (RLS) is enabled on all tables in `supabase/master_schema.sql`. Every query enforces `auth.uid() = user_id`. |
| **OAuth Token Hijack** | Cross-Site Scripting (XSS) extracting tokens | Refresh tokens stored in Supabase `integration_tokens` with RLS. Client access tokens have short TTLs (3600 seconds) and rotate automatically. |
| **Runaway Agent Actions** | Autonomous AI hallucinating task/calendar deletion | Strict Human-in-the-Loop approval gate. Jarvis outputs structured `AIProposedAction` items with `Action ID` and `Pending Approval` badges requiring manual click. |
| **Forged Cron Invocations** | Malicious external requests to `/api/automations/cron` | Validation of `Authorization: Bearer CRON_SECRET` header in serverless route handler. |

---

## 3. Database Row-Level Security (RLS) Specification

All tables in Supabase enforce granular RLS:
```sql
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.automation_runs ENABLE ROW LEVEL SECURITY;

-- Sample policy: Users only access their own records
CREATE POLICY "Users can manage their own tasks"
  ON public.tasks FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own integration tokens"
  ON public.integration_tokens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

---

## 4. Operational Best Practices for Yashwanth
- Never commit `.env` or `.env.local` to git repositories.
- Keep Supabase `service_role` secret confined strictly to Vercel Environment Variables.
- Rotate Google OAuth credentials immediately if exposed in public logs.
