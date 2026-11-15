# YASHWANTH HUB — DEPLOYMENT, PROMOTION & ROLLBACK RUNBOOK
**Current Production Deployment**: `dpl_4ENRGpFH1oD7YuxGFZBDxpEfknvw`  
**Live Alias**: `https://yashwanth-hub.vercel.app/`  
**Target Project**: `yashwanth-hub` (`prj_0At1YSsFsDiRAfIqyEtj81hyCFTg`)  
**Target Organization**: `koyaneniyaswanth-9270s-projects` (`team_myMRm7riJMuO0Io96f19pH1p`)  

---

## 1. Production Release Workflow

### 1.1 Prerequisites & Quality Gates
Before deploying to production, run the mandatory verification sequence:
```powershell
cd C:\Users\recvn\Desktop\yashwanth-hub
npx.cmd tsc -b
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

### 1.2 Deployment Execution
Deploy the verified build directly to the existing production project:
```powershell
npx.cmd vercel deploy --prod --yes
```

### 1.3 Post-Deployment Smoke Verification
```powershell
npx.cmd vercel curl -I https://yashwanth-hub.vercel.app/
npx.cmd vercel curl -s "https://yashwanth-hub.vercel.app/api/ai/chat?action=tools"
```

---

## 2. Rollback Procedure

If an issue occurs in production, an instant zero-downtime rollback can be executed using Vercel CLI:

### Step 1: Identify Known-Good Deployment
Run `vercel ls yashwanth-hub` to view recent production deployments:
```powershell
npx.cmd vercel ls yashwanth-hub
```
*Example known-good prior production deployment*: `https://yashwanth-9aicpv65t-koyaneniyaswanth-9270s-projects.vercel.app` (Deployment ID: `dpl_9aicpv65t...`)

### Step 2: Instant Alias Promotion (Zero Downtime)
Point the production domain `https://yashwanth-hub.vercel.app` back to the previous deployment:
```powershell
npx.cmd vercel alias set <previous-deployment-url> yashwanth-hub.vercel.app
```
*Or via Vercel CLI rollback*:
```powershell
npx.cmd vercel rollback <deployment-id> --yes
```

### Step 3: Verify Rollback
```powershell
npx.cmd vercel curl -I https://yashwanth-hub.vercel.app/
```

---

## 3. Database Migration Rollback Safety

All database schema additions in Yashwanth Hub follow **non-destructive additive patterns**:
- New columns are added with `if not exists` and safe defaults.
- No existing tables or columns are dropped in regular updates.
- If a rollback of an application version is triggered, older application code continues to function seamlessly with the additive schema.
