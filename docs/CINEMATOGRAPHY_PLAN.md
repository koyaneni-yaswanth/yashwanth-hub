# Cinematography Experience: Phase 1 audit and plan

Phase 1 of the cinematography master prompt (audit, no code changes). Written 2026-11-24 against `a1c511e`.
Evidence: five read-only code audits (shell/routing/PWA, data/sync/storage, auth/API/security, AI assistant,
design/motion), direct checks of projects, search and workspaces, and measurements of the live site.
Two planned audit passes (productivity, build) stalled and were done by hand; the planned adversarial
re-check of every claim did not run, so the high-severity security findings below were re-checked by hand.

## 1. What exists today (as it matters here)

| Area | Current state |
|---|---|
| Routing | No router. The page is `?tab=` in the query string (`src/lib/navigation.ts:63`); the pathname is ignored, so `/cinema` renders the hub Dashboard today (checked live). Pages are `React.lazy` chunks in `src/App.tsx:30-86`. |
| Boot | `App.tsx:166-323` always runs Dexie init + seeding, Supabase auth, device heartbeat, realtime channels, reminders, life sync, Google token vault. Fine for the hub, wrong for a public page. |
| First load (live) | 12 JS files ≈ 236 KB brotli (773 KB raw) + 18 KB CSS, including supabase-js (59 KB br) and Dexie (41 KB br). Render-blocking Google Fonts stylesheet. Warm reload: first paint 0.42 s, LCP 1.05 s, CLS 0. Vercel edge cache HIT (bom1). |
| Auth | Local-first, no auth wall. Supabase email/password + Google sign-in on the Integrations tab. **No owner/admin/role concept**; public sign-up is exposed in the UI. |
| Data | Dexie v9, 37 tables. Generic life sync (`lifeSyncCore.ts`/`lifeSync.ts`) is the recipe for new synced tables. Every cloud table is owner-only (`auth.uid() = user_id`); **no public-read policy anywhere**. |
| Files | **No Supabase Storage at all.** Files are IndexedDB blobs, device-only. No image resizing or WebP/AVIF. Zero `<video>` elements, no lightbox. |
| AI | `api/ai/chat.ts`, one request/response, no streaming, plain-text rendering (no markdown), no attachments. Tools only *propose* writes; client verifies by read-back. Modes exist (`MODULAR_AGENTS`). |
| Projects/tasks/calendar | `Project.area` (string) groups projects; tasks and events carry `project_id`. TaskService is the only task write path. Command palette searches entities via `SearchHit` types. |
| Design | CSS variables (`--hub-*`) in `src/index.css`, no Tailwind `@theme`. Precedent for an always-dark scoped theme: `.hub-os` used by Momentum. No animation library; hand-written CSS + rAF. Global button/selection/focus rules would leak into a new route. |
| PWA | Precaches 77 files; `NavigationRoute(index.html)` for every path; no runtime caching, no size cap. |
| Vercel | **11 of the 12 Hobby-plan functions used** (enforced by `tests/v2_security_and_truth.test.mjs:8`), so the whole cinema backend gets **one** function. No CSP, no robots.txt or sitemap (both return the SPA page). |

## 2. Gap analysis (brief sections 2–17)

| § | Requirement | Status |
|---|---|---|
| 2 | Dark editorial design | Partial: scoped-theme pattern reusable; everything else new |
| 3 | Cinematic homepage + nav | None (needs public route tree) |
| 4 | Showreel studio / custom player | None |
| 5–6 | Portfolio grid, project pages, aspect ratios | None |
| 7 | Gallery, lightbox, EXIF | None (Modal.tsx unsuitable: no focus trap/portal) |
| 8–9 | About, services (editable) | None |
| 10 | Motion | Partial: keyframes + reduced-motion blocks exist; no reveal/parallax/view-transition helpers |
| 11 | AI cinematography assistant | Partial: chat, modes, propose/confirm reusable; no attachments, no labelled sections |
| 12 | Production workspace | Partial: projects/tasks/calendar/notes to link into; no film entities |
| 13 | Contact form | None (no anon-insert table, no rate limiting) |
| 14 | Performance/SEO | Partial: code splitting exists; public split, image pipeline, SEO all missing |
| 15 | CMS + storage | None (no Storage, no owner role) |
| 16 | Integration (auth, projects, search, AI) | Reusable |
| 17 | Testing | Reusable: node test runner over pure `.ts` modules |

## 3. Proposed architecture

### Routes
- **Public, chrome-less:** `/cinema` (home), `/cinema/work`, `/cinema/work/:slug`, `/cinema/showreel`, `/cinema/about`, `/cinema/services`, `/cinema/contact`.
  Branch in `src/main.tsx` **before** importing `App`, via `import('./cinema/CinemaApp')`, so Dexie, supabase-js, Google and sync never load for visitors. A ~40-line pathname router (`usePath`, `navigate`, `<Link>`) with View Transitions where supported.
- **Private:** new hub tab `cinema-studio` ("Cinematography Studio", Clapperboard icon) in a new **Creative** sidebar group; lazy page in a `.cine dark` scope like Momentum; signed-in + owner gate.

### Data (new, additive migration; owner runs it)
| Table | Purpose | Access |
|---|---|---|
| `site_admins` | Who the portfolio owner is | Claim-once RPC: first signed-in user to claim becomes owner; nobody can add a second |
| `cine_films` | Portfolio projects: slug, title, year, category, role, client, synopsis, approach, credits/equipment (jsonb), aspect ratio, video (provider + id/url), cover, status `draft/published`, sort_order | Owner all; **anon SELECT where status = 'published'** through a column-limited view |
| `cine_media` | Stills/BTS/gallery items: film_id, kind, storage paths per width, width/height, caption, EXIF subset, sort_order | Same as films (published parent only) |
| `cine_site` | About, services, showreel, social links, public email toggle (single row per owner) | Owner write; anon read of published fields |
| `cine_inquiries` | Contact form submissions | Anon **insert only** (via the API function); owner read; trigger adds an owner notification |
| `cine_productions`, `cine_shots`, `cine_schedule`, `cine_crew`, `cine_gear`, `cine_budget_lines`, `cine_deliverables` | Private production workspace | Owner-only, Dexie + life sync (existing recipe) |

Production entities link to the existing systems instead of duplicating them: each production has a `project_id`
(a hub Project with `area = 'Cinematography'`, which keeps it off unrelated project lists and gives a dedicated dashboard card);
shooting days create calendar events and post-production items create tasks **through TaskService**; scripts/treatments
are Notes/Documents linked by `project_id`; crew can reference Contacts. Budget shows only entered figures.

### Storage
- `cine-public` (public bucket): resized derivatives of **published** stills only, path `<owner>/<film>/<uuid>-<w>.webp`.
- `cine-private` (private): originals, drafts, production references; owner-only policies.
- Browser uploads straight to Storage with the owner's session (Vercel's 4.5 MB body limit rules out proxying).
  Client-side resize to 3 widths + WebP (AVIF where the browser can encode it), so no paid image transforms are needed.
- **Long video:** link YouTube/Vimeo/direct MP4 (poster-first, click-to-load, `youtube-nocookie`). Short clips/hover previews can live in Storage; confirm the plan's per-file limit (free plan is believed to be 50 MB).

### API (one function: `api/cinema.ts`, `?action=`)
- `contact`: validate, honeypot + minimum fill time + per-IP rate limit, insert inquiry. Works with the anon key + insert policy; better with `SUPABASE_SERVICE_ROLE_KEY`.
- `og`: tiny HTML with per-film Open Graph tags for link-preview crawlers (rewrite by user agent is not possible in `vercel.json`, so share links use `/cinema/work/:slug` served by a second static entry `cinema.html` with site-level OG/JSON-LD; per-film previews are the stretch goal).
- Public reads go **directly to PostgREST with `fetch`** and the anon key (no supabase-js on the public bundle).

### Dependencies
- **Add nothing heavy.** No framer-motion/GSAP/Lenis: IntersectionObserver reveals, CSS clip-path masks, one rAF parallax, View Transitions API.
- One self-hosted editorial display font, loaded only by the cinema chunk; the hub's fonts stay unchanged.
- `hls.js` only if an HLS source ever exists; not planned.

## 4. Phase plan

| Phase | Scope | Acceptance |
|---|---|---|
| 2 Design system | `.cine` tokens (#070707, charcoal, white, gold), type scale, grain, motion hooks (`useReducedMotion`, `useReveal`), Dialog primitive on native `<dialog>`, public entry split in `main.tsx` | Public bundle has no `db-*`/`supabase-*` chunks; hub unchanged; tsc/lint/tests green |
| 3 Home, showreel, nav | Hero (poster-first, owner content or honest typographic hero), transparent nav + mobile menu, custom video player (play/pause, volume, scrub, fullscreen, keyboard), YouTube/Vimeo embed fallback | Keyboard-only playback works; no autoplay with sound; LCP ≤ 2.5 s on throttled mobile |
| 4 Portfolio + pages + gallery | Asymmetric grid with filter/sort, project pages (12 sections, all aspect ratios), lightbox (zoom, filmstrip, keyboard), related/prev/next | Works with zero, one and many films; no layout shift (width/height on every image) |
| 5 Studio + AI | Production workspace tables + UI linked to projects/tasks/calendar/notes; Cinematographer AI mode with quick commands, image attachments (client downscale), labelled "Creative suggestion" vs "Verified" sections, `propose_add_shots` | Saved items read back before "saved" is shown; AI unavailable shows a notice, not canned output |
| 6 CMS + database | Migration (tables, view, policies, buckets, claim RPC), upload pipeline, publish/unpublish, reorder, about/services editors | Anon can read only published rows (tested with the anon key); drafts and inquiries return nothing |
| 7 Optimize + ship | SW rules (no video precache, runtime cache for images), robots.txt/sitemap, JSON-LD (Person, CreativeWork, VideoObject), CSP for `/cinema`, cross-device test, deploy | Lighthouse-style checks on mobile + desktop; console clean; production build verified |

The public pages read the published data that the Phase 6 CMS writes. To avoid building the UI blind, the
**migration and read layer move up into Phase 3**, and the CMS editors stay in Phase 6. Until the owner adds content,
visitors see honest empty states and the owner sees "Add your first film" prompts.

## 5. Risks

- **High, existing:** reflected XSS in `api/neosapien/callback.ts:27`. `error_description` from the query string goes unescaped into HTML on the production origin. Re-checked by hand.
- **High, existing:** `api/ai/chat.ts:610` resolves the user but never rejects anonymous callers, so anyone can spend the Gemini key. Re-checked by hand.
- **High:** open sign-up with no role model. Without `site_admins`, any registered user could publish to the portfolio.
- **High:** if the public branch lives inside `App` instead of `main.tsx`, visitors download and boot the whole hub.
- **Medium:** every visitor's browser is seeded with the owner's Pawan Shakti project details (`src/db/index.ts:381-405`). This matters more once the site is publicised.
- **Medium:** one missing cloud table stops all life sync. Production tables must be created before the client ships them, or the queue needs per-table isolation.
- **Medium:** the service worker serves `index.html` for every path and could cache large media. Fix in Phase 2 (deny-list) and Phase 7 (runtime rules).
- **Low:** the Supabase URL/key can be overridden from localStorage. The public bundle should use build-time values only.

## 6. Decisions for the owner (recommendation first)

1. **Where the public site lives:** `/cinema` (recommended; the hub stays at `/`), or take over `/` and move the hub to `/hub`. This can be switched later.
2. **Who owns the portfolio:** a claim-once owner record (recommended). Optionally, turn off public sign-up in Supabase.
3. **Video hosting:** YouTube/Vimeo/direct links for films, plus Storage for stills and short clips (recommended), or Storage for everything (plan limits apply).
4. **Content:** name, designation, bio, showreel and films must come from you. Nothing is invented.
5. **Inquiry alerts:** an in-app notification (recommended, needs no keys), plus email later if wanted.

## 7. Owner actions this work will need
- Run the Phase 6 migration in the Supabase SQL editor (plus the two still-pending Phase 2/3 migrations).
- Optional but recommended: `SUPABASE_SERVICE_ROLE_KEY` in Vercel (stronger contact-form path).
- Upload real stills, a portrait and video links once the CMS exists.
