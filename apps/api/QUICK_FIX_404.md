# Quick Fix for 404 Error

## The Problem
Square is getting 404, which means it can't find the webhook endpoint.

## Most Likely Cause
**Wrong URL in Square webhook configuration**

> **Note:** If you're using Vercel, your URL format is: `https://your-project.vercel.app/v1/webhooks/square`

## Quick Fix Steps

### 1. Get Your Current ngrok URL

Look at your ngrok terminal window. You should see:
```
Forwarding    https://abc123xyz.ngrok-free.app -> http://localhost:4000
```

**Copy this URL:** `https://abc123xyz.ngrok-free.app`

### 2. Verify the Full Webhook URL

Your webhook URL in Square should be:
```
https://YOUR-NGROK-URL.ngrok-free.app/v1/webhooks/square
```

**Important:** Must include `/v1/webhooks/square` at the end!

### 3. Update Square Webhook

1. Go to: https://developer.squareup.com/apps
2. Select your app
3. Go to **Webhooks** → **Subscriptions**
4. Click **Edit** on your webhook
5. Update **Notification URL** to:
   ```
   https://YOUR-NGROK-URL.ngrok-free.app/v1/webhooks/square
   ```
6. Click **Save**

### 4. Test the Endpoint

Test that the endpoint works via ngrok:

```powershell
# Replace YOUR-NGROK-URL with your actual ngrok URL
Invoke-WebRequest -Uri "https://YOUR-NGROK-URL.ngrok-free.app/v1/webhooks/square" -Method POST -Body '{"type":"test"}' -ContentType "application/json" -UseBasicParsing
```

Should return HTTP 200 (not 404).

### 5. Common Mistakes to Avoid

❌ **Wrong:** `https://xxxxx.ngrok-free.app` (missing path)  
✅ **Correct:** `https://xxxxx.ngrok-free.app/v1/webhooks/square`

❌ **Wrong:** `https://xxxxx.ngrok-free.app/webhook` (wrong path)  
✅ **Correct:** `https://xxxxx.ngrok-free.app/v1/webhooks/square`

❌ **Wrong:** `http://xxxxx.ngrok-free.app/v1/webhooks/square` (HTTP instead of HTTPS)  
✅ **Correct:** `https://xxxxx.ngrok-free.app/v1/webhooks/square`

❌ **Wrong:** Old ngrok URL (URL changed after restart)  
✅ **Correct:** Current ngrok URL from running ngrok

## Still Not Working?

1. **Make sure API is running:**
   ```bash
   cd apps/api
   npm run dev
   ```

2. **Make sure ngrok is running:**
   ```bash
   cd apps/api
   npm run ngrok
   ```

3. **Test health endpoint via ngrok:**
   ```
   https://YOUR-NGROK-URL.ngrok-free.app/health
   ```
   Should return: `{"status":"ok","service":"proofpay-api"}`

4. **Check ngrok web interface:**
   - Open: http://127.0.0.1:4040
   - See all incoming requests
   - Check if Square's request appears there

