# How to Clear Vercel Cache

## Method 1: Redeploy (Recommended)

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **API project** (e.g., `aussieadrenaline-api` or `proofpay-api`)
3. Click on **"Deployments"** tab
4. Find the latest deployment (commit `809497d` or newer)
5. Click the **three dots (⋯)** next to the deployment
6. Click **"Redeploy"**
7. Wait for deployment to complete

This will:
- Clear function cache
- Force a fresh build
- Deploy the latest code

## Method 2: Purge Edge Cache (CDN)

### Via Dashboard:
1. Go to Vercel Dashboard → Your Project → **Settings**
2. Click on **"Data Cache"** (or "Caching" in older versions)
3. Click **"Purge Everything"** to clear all cache
4. Or purge specific paths like `/api/verify/*`

### Via Vercel CLI:
```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Login to Vercel
vercel login

# Purge all cache for a project
vercel cache purge

# Or purge specific paths
vercel cache purge /api/verify/*
```

## Method 3: Clear Build Cache

1. Go to Vercel Dashboard → Your Project → **Settings**
2. Click on **"Build & Development Settings"**
3. Scroll down to **"Build Cache"**
4. Click **"Clear Build Cache"**
5. Redeploy your project

## Method 4: Force New Deployment with Cache Buster

Add a trivial change to trigger a fresh deployment:

```bash
# Make a small change to force new deployment
echo "// Cache buster: $(date)" >> apps/api/api/index.js

git add apps/api/api/index.js
git commit -m "Force new deployment - clear cache"
git push origin main
```

## Method 5: Environment Variable Change

Changing an environment variable forces a redeploy:

1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Temporarily add or modify an environment variable (e.g., `CACHE_BUSTER=1`)
3. Save changes
4. This will trigger a new deployment with cleared cache

## Method 6: Vercel API (Advanced)

You can use Vercel's API to purge cache programmatically:

```bash
# Get your Vercel token from: https://vercel.com/account/tokens
export VERCEL_TOKEN="your-token-here"
export PROJECT_ID="your-project-id"
export TEAM_ID="your-team-id" # Optional, if using team

# Purge cache via API
curl -X POST "https://api.vercel.com/v1/deployments/${PROJECT_ID}/cache" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"paths": ["/api/verify/*"]}'
```

## Quick Fix for Your Current Issue

Since you're seeing old code, try this:

1. **Redeploy the latest commit:**
   - Go to Deployments → Find commit `809497d`
   - Click ⋯ → Redeploy
   - Wait for "Ready" status

2. **Clear browser cache:**
   - Open DevTools (F12)
   - Right-click the refresh button
   - Click "Empty Cache and Hard Reload"

3. **Test with a fresh token:**
   - Generate a new QR code/share token
   - Test the new link (old tokens might be cached)

## Verify Cache is Cleared

After clearing cache, check Vercel logs for the new debug messages:
- `🔍 [VERIFY-API] About to call getReceiptByToken`
- `🔍 [VERIFY-API] getReceiptByToken returned:`
- `🔍 [VERIFY-API] Receipt items from getReceiptByToken:`

If you see these logs, the new code is running and cache is cleared.

