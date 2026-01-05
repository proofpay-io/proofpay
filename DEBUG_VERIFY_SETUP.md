# How to Enable DEBUG_VERIFY Flag

The verify page supports a debug footer that shows diagnostic information when enabled.

## Enable Debug Footer

1. **Go to Vercel Dashboard:**
   - Visit: https://vercel.com
   - Select your **Web project** (e.g., `proofpay-web`)

2. **Go to Settings → Environment Variables:**
   - Click **"Settings"** tab
   - Click **"Environment Variables"** in the sidebar

3. **Add New Variable:**
   - **Key:** `NEXT_PUBLIC_DEBUG_VERIFY`
   - **Value:** `true`
   - **Environment:** Select all (Production, Preview, Development)
   - Click **"Save"**

4. **Redeploy:**
   - Go to **"Deployments"** tab
   - Click **"..."** on the latest deployment
   - Click **"Redeploy"**
   - Wait for deployment to complete

## What the Debug Footer Shows

When enabled, the verify page will show a small debug footer at the bottom with:
- **Items fetched:** Number of receipt items returned from API
- **Receipt ID:** First 8 characters of receipt ID (for verification)

Example:
```
Items fetched: 4
Receipt ID: d1588ba5...
```

## Disable Debug Footer

To disable, either:
1. **Remove the environment variable** from Vercel
2. **Set value to:** `false` or empty string
3. **Redeploy** the application

## Privacy Note

The debug footer only shows:
- Item count (not item names or details)
- Partial receipt ID (first 8 chars, not full ID)
- No customer information
- No sensitive data

This is safe for production use if needed for troubleshooting.

