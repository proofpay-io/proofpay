# Deploying API to Vercel

## Overview

This guide will help you deploy your Fastify API to Vercel, replacing ngrok with a permanent, production-ready solution.

## Prerequisites

1. **Vercel account** (free tier works)
   - Sign up at: https://vercel.com/signup
   - Or use GitHub to sign in

2. **Vercel CLI** (optional, for CLI deployment)
   ```bash
   npm i -g vercel
   ```

## Step 1: Prepare Environment Variables

Your API needs these environment variables in Vercel:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT` (optional, defaults to 'sandbox')

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel Dashboard (Recommended)

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com/dashboard
   - Click **Add New Project**

2. **Import Your Repository:**
   - Connect your Git repository (GitHub, GitLab, or Bitbucket)
   - Or upload the project folder

3. **Configure Project:**
   - **Root Directory:** `apps/api`
   - **Framework Preset:** Other (or Node.js)
   - **Build Command:** (leave empty - no build needed)
   - **Output Directory:** (leave empty)

4. **Add Environment Variables:**
   - Click **Environment Variables**
   - Add each variable:
     - `SUPABASE_URL` = `https://ztqdsxgvgzlosufkdskk.supabase.co`
     - `SUPABASE_SERVICE_ROLE_KEY` = (your service role key)
     - `SQUARE_ACCESS_TOKEN` = (your Square access token)
     - `SQUARE_ENVIRONMENT` = `sandbox`

5. **Deploy:**
   - Click **Deploy**
   - Wait for deployment to complete

6. **Get Your URL:**
   - After deployment, you'll get a URL like: `https://your-project.vercel.app`
   - This is your permanent API URL!

### Option B: Deploy via CLI

1. **Install Vercel CLI:**
   ```bash
   npm i -g vercel
   ```

2. **Login:**
   ```bash
   vercel login
   ```

3. **Navigate to API directory:**
   ```bash
   cd apps/api
   ```

4. **Deploy:**
   ```bash
   vercel
   ```

5. **Add Environment Variables:**
   ```bash
   vercel env add SUPABASE_URL
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   vercel env add SQUARE_ACCESS_TOKEN
   vercel env add SQUARE_ENVIRONMENT
   ```

6. **Redeploy with environment variables:**
   ```bash
   vercel --prod
   ```

## Step 3: Test Your Deployment

### Test Health Endpoint

```bash
curl https://your-project.vercel.app/health
```

Should return: `{"status":"ok","service":"proofpay-api"}`

### Test Webhook Endpoint

```bash
curl -X POST https://your-project.vercel.app/v1/webhooks/square \
  -H "Content-Type: application/json" \
  -d '{"type":"payment.created","event_id":"test"}'
```

Should return HTTP 200.

## Step 4: Configure Square Webhook

1. **Go to Square Developer Dashboard:**
   - Visit: https://developer.squareup.com/apps
   - Select your app

2. **Update Webhook URL:**
   - Go to **Webhooks** → **Subscriptions**
   - Edit your webhook subscription
   - **Notification URL:** `https://your-project.vercel.app/v1/webhooks/square`
   - Click **Save**

## Step 5: Verify

- ✅ Health endpoint works: `https://your-project.vercel.app/health`
- ✅ Webhook endpoint works: `https://your-project.vercel.app/v1/webhooks/square`
- ✅ Square webhook logs show "delivered"
- ✅ Receipts are created in Supabase

## Custom Domain (Optional)

Vercel allows you to add a custom domain:

1. Go to Project Settings → Domains
2. Add your custom domain
3. Update Square webhook URL to use custom domain

## Benefits of Vercel vs ngrok

✅ **Permanent URL** - Doesn't change  
✅ **Production-ready** - SSL, CDN, global edge network  
✅ **Free tier** - Generous free limits  
✅ **Automatic deployments** - Deploys on git push  
✅ **Environment variables** - Secure secret management  
✅ **Logs & monitoring** - Built-in analytics  
✅ **No local server needed** - Runs in the cloud  

## Troubleshooting

### Deployment Fails

- Check that `vercel.json` exists in `apps/api/`
- Verify all environment variables are set
- Check Vercel deployment logs for errors

### Webhook Returns 404

- Verify the URL is: `https://your-project.vercel.app/v1/webhooks/square`
- Check that deployment was successful
- Verify routes are configured in `vercel.json`

### Environment Variables Not Working

- Make sure variables are set in Vercel dashboard
- Redeploy after adding environment variables
- Check variable names match exactly (case-sensitive)

## Local Development

You can still develop locally:

```bash
cd apps/api
npm run dev
```

The local server runs on `http://localhost:4000` as before.

## Next Steps

1. Deploy to Vercel
2. Update Square webhook URL to your Vercel URL
3. Test webhook delivery
4. Remove ngrok-related files (optional cleanup)

