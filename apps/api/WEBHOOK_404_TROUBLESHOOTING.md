# Troubleshooting 404 Error from Square Webhook

## Common Causes of 404

1. **Wrong URL in Square** - Missing `/v1/webhooks/square` path
2. **Deployment not running** - Vercel deployment failed or API server is down
3. **API not running** - Server is not listening (for local development)
4. **Wrong deployment URL** - Using incorrect Vercel URL or old ngrok URL

## Step-by-Step Fix

### 1. Verify API is Running

```bash
# Check if API responds locally
curl http://localhost:4000/health
```

Should return: `{"status":"ok","service":"proofpay-api"}`

If not, start API:
```bash
cd apps/api
npm run dev
```

### 2. Verify ngrok is Running

Check ngrok status:
- Look for ngrok terminal window
- Should show: `Forwarding https://xxxxx.ngrok-free.app -> http://localhost:4000`

If not running, start it:
```bash
cd apps/api
npm run ngrok
```

### 3. Get Current ngrok URL

When ngrok is running, you'll see:
```
Forwarding    https://abc123xyz.ngrok-free.app -> http://localhost:4000
```

**Copy this URL exactly** - it changes each time you restart ngrok!

### 4. Test Health Endpoint via ngrok

```powershell
# Replace with your actual ngrok URL
Invoke-WebRequest -Uri "https://YOUR-NGROK-URL.ngrok-free.app/health" -UseBasicParsing
```

Should return: `{"status":"ok","service":"proofpay-api"}`

If this fails, ngrok is not working correctly.

### 5. Test Webhook Endpoint via ngrok

```powershell
$body = @{
    type = "payment.created"
    event_id = "test-404-check"
    merchant_id = "test"
    data = @{
        type = "payment"
        id = "payment-event-id"
        object = @{
            payment = @{
                id = "test-payment-id"
            }
        }
    }
} | ConvertTo-Json -Depth 5

Invoke-WebRequest -Uri "https://YOUR-NGROK-URL.ngrok-free.app/v1/webhooks/square" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
```

Should return HTTP 200 (not 404).

### 6. Verify Square Webhook URL

Go to Square Dashboard:
1. https://developer.squareup.com/apps
2. Your app → Webhooks → Subscriptions
3. Check the **Notification URL**

**Must be exactly:**
```
https://YOUR-NGROK-URL.ngrok-free.app/v1/webhooks/square
```

**Common mistakes:**
- ❌ Missing `/v1/webhooks/square` → `https://xxxxx.ngrok-free.app`
- ❌ Wrong path → `https://xxxxx.ngrok-free.app/webhook`
- ❌ Old ngrok URL → URL changed after restart
- ❌ HTTP instead of HTTPS → `http://xxxxx.ngrok-free.app/...`

### 7. Update Square Webhook URL

If the URL is wrong:
1. Edit the webhook subscription
2. Update Notification URL to: `https://YOUR-CURRENT-NGROK-URL.ngrok-free.app/v1/webhooks/square`
3. Save
4. Square will send a verification request

## Quick Checklist

- [ ] API is running on port 4000
- [ ] ngrok is running and forwarding to port 4000
- [ ] Health endpoint works via ngrok: `https://YOUR-URL.ngrok-free.app/health`
- [ ] Webhook endpoint works via ngrok: `https://YOUR-URL.ngrok-free.app/v1/webhooks/square`
- [ ] Square webhook URL is: `https://YOUR-URL.ngrok-free.app/v1/webhooks/square`
- [ ] URL uses HTTPS (not HTTP)
- [ ] URL includes `/v1/webhooks/square` path

## Still Getting 404?

1. **Check ngrok web interface:**
   - Open: http://127.0.0.1:4040
   - See incoming requests and responses
   - Check if Square's request is reaching ngrok

2. **Check API logs:**
   - Look for any incoming requests
   - Check for errors

3. **Verify route registration:**
   - Route should be: `POST /v1/webhooks/square`
   - Check `apps/api/app.js` line 39

4. **Restart everything:**
   - Stop API (Ctrl+C)
   - Stop ngrok (Ctrl+C)
   - Start API: `npm run dev`
   - Start ngrok: `npm run ngrok`
   - Update Square with new ngrok URL

