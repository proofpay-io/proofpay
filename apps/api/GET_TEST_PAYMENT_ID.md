# How to Get a Square Test Payment ID

Here are several ways to get a payment ID for testing:

## Option 1: List Existing Payments (Easiest)

Run this command to see payments already in your Square account:

```bash
cd apps/api
npm run list-payments
```

This will show you:
- All recent payments in your Square Sandbox
- Payment IDs you can use for testing
- Ready-to-use test commands

## Option 2: Create Payment via Square Sandbox Dashboard

1. **Go to Square Sandbox:**
   - Visit: https://squareupsandbox.com
   - Sign in with your sandbox test account

2. **Create a Test Transaction:**
   - Use Square's Point of Sale or Online Checkout
   - Complete a test payment
   - Note the payment ID from the transaction details

3. **Then test the webhook** with that payment ID

## Option 3: Use Square's Test Payment Values

Square provides test payment IDs in their documentation:
- https://developer.squareup.com/docs/testing/test-values
- Look for "Test Payment IDs" or "Sandbox Test Values"

## Option 4: Create Payment via Square API

If you have a Square location set up, you can create a payment programmatically. However, this requires:
- At least one location in your Square account
- Proper API setup

## Quick Test Command

Once you have a payment ID, use this to test the webhook:

```powershell
# Replace YOUR_PAYMENT_ID with actual payment ID
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

Invoke-RestMethod -Uri http://localhost:4000/v1/webhooks/square -Method POST -Body $body -ContentType "application/json"
```

## Recommended Approach

**Start with Option 1** - run `npm run list-payments` to see if you already have payments in your Square account. If you do, you can immediately test the webhook!

If you don't have any payments, use **Option 2** to create one through the Square Sandbox dashboard.
