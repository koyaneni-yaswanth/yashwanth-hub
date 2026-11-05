# Yashwanth Hub — Deployment & Operations Guide

## 1. Production Architecture Summary
- **Live Production URL**: `https://yashwanth-hub.vercel.app`
- **Hosting Platform**: Vercel Serverless Platform
- **Database**: Supabase PostgreSQL (`xjhkxnfahkkgwbbtmhtk`, Region: `ap-northeast-1` Tokyo)
- **Mobile Runtime**: Android Capacitor 8 Build (`com.yashwanth.hub`)
- **Git Repository**: `https://github.com/koyaneni-yaswanth/yashwanth-hub` (Branch: `main`)

---

## 2. Environment Variables Specification

### 2.1 Frontend / Public Client (Vite)
Configured in `.env` and Vercel Environment Variables:
```env
VITE_SUPABASE_URL=https://xjhkxnfahkkgwbbtmhtk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
VITE_GOOGLE_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
```

### 2.2 Backend / Serverless Functions (Vercel)
Configured in Vercel Project Settings $\rightarrow$ Environment Variables:
```env
SUPABASE_URL=https://xjhkxnfahkkgwbbtmhtk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
CRON_SECRET=your-random-cron-secret-key-32-chars
GOOGLE_CLIENT_SECRET=your-google-oauth-client-secret
NEOSAPIEN_API_KEY=your-neosapien-mcp-key
```

---

## 3. Web Deployment Pipeline (Vercel)

### Step 1: Pre-flight Verification
Run local linting, type checks, and build:
```bash
# Type verification
npx tsc --noEmit

# Production bundle compilation
npm run build
```

### Step 2: Push to GitHub Main
```bash
git add .
git commit -m "feat: production release"
git push origin main
```

### Step 3: Deploy to Vercel Production
```bash
# Deploy directly with Vercel CLI
npx vercel --prod --yes
```

---

## 4. Android Native Build (Capacitor 8)

### Step 1: Synchronize Web Assets
```bash
# Compile web assets into dist/
npm run build

# Sync assets and native plugins to android/
npx cap sync android
```

### Step 2: Assemble Android APK
```bash
cd android
./gradlew assembleDebug

# Output APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

---

## 5. Health Monitoring & Rollback
- Vercel dashboard provides real-time function logs under **Deployments $\rightarrow$ Functions**.
- In the event of a regression, rollback instantly via Vercel CLI:
  ```bash
  npx vercel rollback [deployment-url]
  ```
- Yashwanth Hub client includes **Hub 13: System Health & Sync Center** to inspect database sync status, storage quotas, and network telemetry in real time.
