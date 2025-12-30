# How to Test the Square Webhook

## Step 1: Get a Square Payment ID

You need a real payment ID from Square Sandbox. Here are two ways:

### Option A: Create a Test Payment via Square API

1. Use Square's test payment endpoint or create a payment through their sandbox
2. The payment ID will be returned (format: `payment_abc123...`)

### Option B: Use Square Sandbox Test Values

Square provides test payment IDs. Check their documentation for current test values.

## Step 2: Send the Webhook Request

### Using PowerShell (Windows)

```powershell
# Replace YOUR_PAYMENT_ID with actual Square payment ID
$paymentId = "YOUR_PAYMENT_ID"
$body = @{
    type = "payment.created"
    event_id = "test-event-$(Get-Date -Format 'yyyyMMddHHmmss')"
    merchant_id = "test-merchant"
    data = @{
        type = "payment"
        id = "payment-event-id"
        object = @{
            payment = @{
                id = $paymentId
            }
        }
    }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri http://localhost:4000/v1/webhooks/square `
    -Method POST `
    -Body $body `
    -ContentType "application/json"
```

### Using curl (if available)

```bash
curl -X POST http://localhost:4000/v1/webhooks/square \
  -H "Content-Type: application/json" \
  -d '{
    "type": "payment.created",
    "event_id": "test-event-123",
    "merchant_id": "test-merchant",
    "data": {
      "type": "payment",
      "id": "payment-event-id",
      "object": {
        "payment": {
          "id": "YOUR_PAYMENT_ID"
        }
      }
    }
  }'
```

### Using the Test Script

```bash
cd apps/api
npm run test-webhook YOUR_PAYMENT_ID
```

## Step 3: Check the Response

You should see a response like:
```json
{
  "success": true,
  "message": "Webhook received",
  "processed": 1,
  "ignored": 0,
  "results": [{
    "processed": true,
    "eventType": "payment.created",
    "eventId": "test-event-123",
    "receiptId": "uuid-here",
    "paymentId": "your-payment-id",
    "itemCount": 2,
    "message": "Receipt created successfully"
  }]
}
```

## Step 4: Verify in Supabase

1. Go to https://app.supabase.com
2. Select your project
3. Navigate to **Table Editor**
4. Check the `receipts` table - you should see a new row
5. Check the `receipt_items` table - you should see items if the payment had an order

## Step 5: Check API Logs

Watch your terminal where `npm run dev` is running. You should see logs like:
- 📥 Square webhook received
- 📡 Fetching payment details from Square
- ✅ Payment details fetched
- 💾 Creating receipt in database
- ✅ Receipt created successfully
- 🎉 Payment processed successfully

## Troubleshooting

**"Payment ID not found"**
- Make sure you're using a real Square payment ID from your sandbox

**"Square API error"**
- Verify your Square access token is correct in `.env`
- Check that the payment ID exists in your Square account

**"Supabase is not configured"**
- Check your `.env` file has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

