# How to Import Repository to Vercel

## Step-by-Step Guide

### 1. Sign In to Vercel

1. Go to https://vercel.com
2. Click **"Sign Up"** or **"Log In"**
3. Sign in with your GitHub account (recommended for easy integration)

### 2. Import Your Repository

1. Once logged in, you'll see the Vercel dashboard
2. Click the **"Add New..."** button (usually in the top right)
3. Select **"Project"** from the dropdown

### 3. Connect GitHub (if not already connected)

1. If you haven't connected GitHub yet:
   - Click **"Import Git Repository"**
   - You'll see options to connect GitHub, GitLab, or Bitbucket
   - Click **"Continue with GitHub"**
   - Authorize Vercel to access your repositories
   - You may need to install the Vercel GitHub App

2. If GitHub is already connected:
   - You'll see a list of your repositories
   - Search for: `proofpay-io/aussieadrenaline`
   - Click **"Import"** next to your repository

### 4. Configure Project Settings

**For the API Project (`apps/api`):**

1. **Project Name**: `proofpay-api` (or any name you prefer)
2. **Root Directory**: Click **"Edit"** and set to: `apps/api`
3. **Framework Preset**: Select **"Other"** (since it's a Fastify API)
4. **Build Command**: Leave empty (or use `npm install`)
5. **Output Directory**: Leave empty
6. **Install Command**: `npm install`
7. **Development Command**: `npm run dev`

**For the Web App Project (`apps/web`):**

1. **Project Name**: `proofpay-web` (or any name you prefer)
2. **Root Directory**: Click **"Edit"** and set to: `apps/web`
3. **Framework Preset**: Select **"Next.js"** (Vercel will auto-detect)
4. **Build Command**: `npm run build` (auto-detected)
5. **Output Directory**: `.next` (auto-detected)
6. **Install Command**: `npm install`
7. **Development Command**: `npm run dev`

### 5. Add Environment Variables

**Before deploying, add environment variables:**

**For API Project:**
1. In the project configuration, scroll to **"Environment Variables"**
2. Click **"Add"** and add each variable:

```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SQUARE_ACCESS_TOKEN=your-square-token (optional)
SQUARE_ENVIRONMENT=sandbox (optional)
BANK_ADMIN_SECRET=your-secret-key (optional)
```

**For Web App Project:**
1. Add environment variable:

```
NEXT_PUBLIC_API_URL=https://your-api-project.vercel.app
```
*(Replace with your actual API Vercel URL after the API is deployed)*

### 6. Deploy

1. Click **"Deploy"** button
2. Vercel will:
   - Install dependencies
   - Build your project
   - Deploy to a production URL
3. Wait for deployment to complete (usually 1-3 minutes)

### 7. Get Your Deployment URLs

After deployment completes:

1. You'll see a success message with your deployment URL
2. **API URL**: `https://proofpay-api-xxxxx.vercel.app` (or your custom domain)
3. **Web App URL**: `https://proofpay-web-xxxxx.vercel.app` (or your custom domain)

### 8. Update Web App Environment Variable

After the API is deployed:

1. Go to your **Web App project** in Vercel
2. Go to **Settings** → **Environment Variables**
3. Update `NEXT_PUBLIC_API_URL` to your actual API URL:
   ```
   NEXT_PUBLIC_API_URL=https://proofpay-api-xxxxx.vercel.app
   ```
4. **Redeploy** the web app (or it will auto-redeploy on next push)

## Quick Import Checklist

- [ ] Sign in to Vercel
- [ ] Connect GitHub account
- [ ] Import `proofpay-io/aussieadrenaline` repository
- [ ] Create API project with root directory `apps/api`
- [ ] Create Web App project with root directory `apps/web`
- [ ] Add environment variables to both projects
- [ ] Deploy both projects
- [ ] Update `NEXT_PUBLIC_API_URL` in web app with API URL
- [ ] Test deployments

## Troubleshooting

**"Repository not found":**
- Make sure you've authorized Vercel to access your GitHub account
- Check that the repository is public or you have access to it
- Try refreshing the repository list

**"Build failed":**
- Check the build logs in Vercel dashboard
- Verify all dependencies are in `package.json`
- Check that root directory is set correctly

**"Environment variables not working":**
- Make sure variables are added to the correct project
- Check for typos in variable names
- Redeploy after adding variables

**"API URL not found":**
- Make sure API project is deployed first
- Copy the exact URL from Vercel dashboard
- Update web app environment variable and redeploy

## Alternative: Deploy via Vercel CLI

If you prefer command line:

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy API
cd apps/api
vercel

# Deploy Web App
cd ../web
vercel
```

## Next Steps After Import

1. ✅ Run database migrations in Supabase
2. ✅ Test API health endpoint
3. ✅ Test web app
4. ✅ Generate test receipts
5. ✅ Configure Square webhooks (optional)

