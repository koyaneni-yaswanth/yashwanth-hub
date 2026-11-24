# Jarvis OS v3.0 (cinematic brief): Phase 1–2 audit and roadmap

Written 2026-11-24 against `32586c2`. This covers phases 1–2 of the "Ultimate Master Prompt": investigation and a prioritised roadmap.
No app code was changed for it.
It builds on [AUDIT_V3.md](AUDIT_V3.md) (feature audit), [CINEMATOGRAPHY_PLAN.md](CINEMATOGRAPHY_PLAN.md) (code-level architecture audit),
fresh checks of the live auth configuration, and the Vercel environment variable list (names only, no values read).

## 1. Facts that change the brief

| Brief assumes | Actually |
|---|---|
| React/Next.js, middleware, server actions | **Vite 8 + React 19 SPA**. No Next.js, no middleware, no server actions. Routing is `?tab=` (no router). Serverless functions live in `/api`: 11 of the Hobby plan's 12 are used. |
| `NEXT_PUBLIC_*` env vars | `VITE_*` (client) and plain names (server). |
| Three.js r187 to install | **Already installed: `three@0.187.0`**, used by Momentum's constellation. Addons (EffectComposer, UnrealBloomPass, Sky) ship inside the same package under `three/examples/jsm`, so versions can't mix. |
| Sign-in, sign-up and profile pages | None exist. Sign-in is a panel on the **Integrations & Sync** tab, and the app has no auth wall (local-first). |
| Separate Startup Command and Pawan Shakti workspaces | **One page.** Tab id `startup-command` is labelled "Pawan Shakti"; `wind-plan` is an alias of it. |
| IvLabs, MG Automation, Personal workspaces | Only **areas** (labels on tasks/projects, seeded in `src/db/index.ts:158-159`). There's no page for them. The 3D node map can only link to what exists: an area-filtered Projects view, or new workspaces if you want them. |
| "Jarvis OS" page | No such page. "Jarvis OS v2.5" is a label in the sidebar footer (`Sidebar.tsx:273`). |

## 2. Google sign-in diagnostics

Two **separate** Google flows exist and were being confused:

| Flow | What it's for | Path | Status |
|---|---|---|---|
| **A. Hub sign-in** | Your account and cloud sync | Supabase Auth: Google provider. App → `xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/authorize` → Google → Supabase callback `/auth/v1/callback` → back to `redirectTo` (`window.location.origin`) | **Probably working.** Live checks: Google provider **enabled**, email enabled, sign-ups open, email confirmation required. Google accepts the request and shows its "Sign in with Google" page (no `invalid_client`). Not verified past Google's page: that needs your Google login. |
| **B. Google Workspace connection** | Google Tasks/Calendar/Gmail | Browser PKCE → Google → app → `POST /api/auth/google/token`, which exchanges the code using `GOOGLE_CLIENT_SECRET` | **Broken: `invalid_client`.** The client ID is hard-coded in `googleAuthService.ts:46-49` (the same client Supabase uses). The secret in Vercel doesn't belong to that client. |

Vercel environment variables. Production only: there are **no Preview or Development variables**, so preview deployments run without Supabase or AI.

| Name | Present |
|---|---|
| VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, SUPABASE_URL, SUPABASE_ANON_KEY | yes |
| GEMINI_API_KEY, CRON_SECRET | yes |
| GOOGLE_CLIENT_SECRET | yes (rejected by Google; see B) |
| GOOGLE_CLIENT_ID | **no**. `api/auth/google/callback.ts` needs it (or `VITE_GOOGLE_CLIENT_ID`) and returns `server_misconfigured` without it. `token.ts` gets the ID from the browser instead. |
| SUPABASE_SERVICE_ROLE_KEY | **no**. Automations fail. |

**Repair steps (owner, about 10 minutes):**
1. Google Cloud Console → Credentials → open the Web client whose ID ends in `…ms6.apps.googleusercontent.com`.
2. Authorised redirect URIs must include `https://xjhkxnfahkkgwbbtmhtk.supabase.co/auth/v1/callback` (flow A), `https://yashwanth-hub.vercel.app/api/auth/google/callback` and `https://yashwanth-hub.vercel.app` (flow B). JavaScript origins: `https://yashwanth-hub.vercel.app`, `http://localhost:5173`.
3. Create a new client secret. Paste it into Vercel `GOOGLE_CLIENT_SECRET` **and** into Supabase → Authentication → Providers → Google, so both match. Add `GOOGLE_CLIENT_ID` (the full ID) to Vercel.
4. Supabase → Authentication → URL Configuration: Site URL `https://yashwanth-hub.vercel.app`; redirect URLs `https://yashwanth-hub.vercel.app/**` and `http://localhost:5173/**`.
5. OAuth consent screen: if it's in **Testing**, add your Google account as a test user (Gmail/Calendar scopes are restricted).
6. Redeploy.

I couldn't check Google Cloud Console or the Supabase dashboard settings (no access). Steps 2, 4 and 5 are **manual verification**.

**Code issues found in the auth path (to fix in brief phase 6):**
- `signInWithGoogleOAuth` makes two extra probe requests to Supabase before every sign-in (`supabaseAuthService.ts:116,163`). They're fragile and slow; read `/auth/v1/settings` once instead.
- It sends `access_type=offline&prompt=consent` on hub sign-in, which forces the consent screen every time.
- The Supabase URL and key can be overridden from localStorage (`src/lib/supabase.ts`). Allow that in development only.
- `token.ts` logs the full Google error object, including the code and verifier (`AUDIT_V3.md`). Still open.
- No auth listener registered twice was found: there's one `onAuthStateChange`, in the singleton.

## 3. Feature status (updated since AUDIT_V3)

| Status | Features |
|---|---|
| Working (code + browser) | Tasks v3 (subtasks, repeats, blockers, board), Calendar (month/week/day/agenda, clashes, overnight), Daily Compass, Deep Work, Goals & Habits (local; cloud after migration), Momentum, Analytics, toasts, AI model auto-selection, after-deploy reload |
| Requires external configuration | Google Workspace sync (secret), Automations (service-role key), cloud sync of goals/habits/plans/focus and the new task fields (2 migrations not yet run) |
| Partial | Documents (files are device-only, not synced), Search (palette searches entities; no document contents), AI (no streaming, plain-text answers, no attachments) |
| Not implemented | Sign-in page and protected areas, auth diagnostics page, streaming AI, 3D command centre, workspace-specific visual identities |
| Duplicates | Pawan Shakti ×2 routes, Memory Vault ×2, Files & Docs ×2, Finance ×2 (aliases already redirect) |

## 4. Content and UX findings

- **Brief's examples confirmed:** "Show full overview (stats, Pawan Shakti, Robotics Lab, Neo 1 & pinned notes)" at `DashboardPage.tsx:830`, and "Clear schedule this week" at `DashboardPage.tsx:724`.
- **Naming drift:** "Daily Compass" vs the brief's "My Day"; "Memory Vault" vs "Notes & Knowledge"; "Files & Docs" vs "Documents"; "Deep Work" vs "Focus". Pick one vocabulary (proposal: My Day, Notes & Knowledge, Documents, Focus).
- **Footer version label** says v2.5.
- **Sign-in is buried** in Integrations & Sync. There's no visible signed-in or signed-out state in the header beyond a "Sign in" button.
- **Typography:** the root uses Tailwind's `font-sans`, so most text renders in the system font, not the loaded IBM Plex (CINEMATOGRAPHY_PLAN §1). Three Google Fonts load render-blocking for little effect.
- **Remaining blocking `alert()` dialogs:** cleared in Phase 1 (stabilize); recheck during the redesign.
- **Starter data:** every new visitor's browser is seeded with your projects (Pawan Shakti patent/TRL, MG Automation, IvLabs). It reads as real data and is private context.

## 5. Conflicts to settle before building

1. **Two design systems requested.** The cinematography brief wants #070707 with gold; this brief wants #050608 / #0A0D12 / #10151D, gold #C6A46B and steel blue #8BA8C8, with Space Grotesk, Inter, a serif and mono.
   **Proposal:** one system (this brief's tokens) for the whole hub, with the public `/cinema` portfolio as its editorial variant.
2. **Always-dark vs the current light/dark toggle.** The brief's palette is dark-only. Proposal: dark becomes the default and the redesign targets it first; the light theme is kept but restyled later.
3. **3D on the home screen vs performance.** The scene must be lazy-loaded after the dashboard's first paint, with quality tiers and a 2D fallback. Today's first load is already about 236 KB of compressed JS.

## 6. Roadmap (brief phases 3–10)

| # | Phase | Main deliverables | Owner needed |
|---|---|---|---|
| 0 | **Now, owner** | Google secret + client ID + redirect URIs (§2), service-role key, run the 2 pending migrations | yes |
| 3 | Design system | Tokens, fonts (self-hosted, subset), type scale, primitives (Button, Field, Dialog, Tabs, EmptyState), dark default, copy vocabulary | |
| 4 | Three.js core | `src/three/` (JarvisScene, JarvisCore, OrbitalSystem, ParticleField, WorkspaceNodes, CinematicCamera, Lighting, PostProcessing, SceneFallback), quality tiers, context-loss handling, pause when hidden, nodes linked to real tabs/areas with real project status | |
| 5 | Dashboard + workspaces | New command centre layout, entry intro (skippable, first visit only), redesigned nav + Ctrl+K, per-workspace character, copy rewrite | |
| 6 | Auth | Sign-in/up screen, header account menu, owner-only diagnostics page (live checks + "manual verification" rows + history), probe cleanup, log hygiene | Google/Supabase settings |
| 7 | AI + features | Streaming responses, markdown rendering, workspace tools, attachments; fix the Gemini array-schema bug | |
| 8 | DB/security/perf | Schema-drift migrations for hand-made tables, RLS tests, CORS, CSP, bundle budget | run SQL |
| 9–10 | Test + deploy | Regression matrix, device checks, measured LCP/CLS/INP, production verification | |

The cinematography phases slot in after phase 5 and reuse the same design system.
