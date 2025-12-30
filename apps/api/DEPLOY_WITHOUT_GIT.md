# Deploy to Vercel Without Git (CLI Method)

Since you don't have a Git repository, use the Vercel CLI to deploy directly.

## Step 1: Install Vercel CLI

Open PowerShell and run:

```powershell
npm i -g vercel
```

## Step 2: Login to Vercel

```powershell
vercel login
```

This will open your browser to authenticate with Vercel.

## Step 3: Navigate to API Directory

```powershell
cd "C:\Users\user\ProofPay Cursor\apps\api"
```

## Step 4: Deploy

```powershell
vercel
```

You'll be asked a few questions:
- **Set up and deploy?** → Yes
- **Which scope?** → Select your account
- **Link to existing project?** → No (first time)
- **Project name?** → `proofpay-api` (or press Enter for default)
- **Directory?** → `./` (current directory)
- **Override settings?** → No

## Step 5: Add Environment Variables

After the first deployment, add your environment variables:

```powershell
vercel env add SUPABASE_URL
# Paste: https://ztqdsxgvgzlosufkdskk.supabase.co

vercel env add SUPABASE_SERVICE_ROLE_KEY
# Paste your service role key

vercel env add SQUARE_ACCESS_TOKEN
# Paste your Square access token

vercel env add SQUARE_ENVIRONMENT
# Type: sandbox
```

## Step 6: Redeploy with Environment Variables

```powershell
vercel --prod
```

## Step 7: Get Your URL

After deployment, Vercel will show you a URL like:
```
https://proofpay-api.vercel.app
```

**That's your permanent API URL!**

## Step 8: Update Square Webhook

1. Go to: https://developer.squareup.com/apps
2. Your app → Webhooks → Subscriptions
3. Update Notification URL to:
   ```
   https://your-project.vercel.app/v1/webhooks/square
   ```

## Test Your Deployment

```powershell
# Test health endpoint
curl https://your-project.vercel.app/health

# Should return: {"status":"ok","service":"proofpay-api"}
```

## Future Deployments

After the first deployment, you can redeploy anytime with:

```powershell
cd "C:\Users\user\ProofPay Cursor\apps\api"
vercel --prod
```

---

**Note:** If you want to set up Git later for automatic deployments, you can:
1. Initialize Git: `git init`
2. Create a GitHub repository
3. Push your code
4. Connect it to Vercel for automatic deployments on every push

