# Square Webhook Testing Guide

## Overview

The webhook handler now:
1. ✅ Fetches payment details from Square API
2. ✅ Fetches order details if orderId is present
3. ✅ Creates a receipt row in Supabase
4. ✅ Creates receipt_items from order line items
5. ✅ Logs all steps clearly

## Testing the Webhook

### Option 1: Test with Real Square Payment (Recommended)

To test with a real payment from Square:

1. **Create a test payment in Square Sandbox:**
   - Use Square's test payment flow or API
   - Note the payment ID that gets created

2. **Send webhook event:**
   ```bash
   # Replace PAYMENT_ID with actual Square payment ID
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
             "id": "PAYMENT_ID_HERE"
           }
         }
       }
     }'
   ```

3. **Check the logs** for:
   - Payment details fetched
   - Order details fetched (if available)
   - Receipt created
   - Receipt items created (if order has line items)

4. **Verify in Supabase:**
   - Go to Supabase Dashboard → Table Editor
   - Check `receipts` table for new row
   - Check `receipt_items` table for items (if order had line items)

### Option 2: Use Test Script

```bash
cd apps/api
node scripts/test-webhook.js [payment_id]
```

Replace `[payment_id]` with a real Square payment ID from your sandbox.

### Option 3: Test with Square Webhook Simulator

Square provides webhook testing tools in their developer dashboard. You can configure your webhook URL to point to your local server using a tool like ngrok.

## What to Check

### ✅ Success Indicators

1. **API Logs should show:**
   ```
   📥 Square webhook received
   🔄 Processing payment.created event
   📡 Fetching payment details from Square
   ✅ Payment details fetched
   📡 Fetching order details from Square (if orderId exists)
   ✅ Order details fetched (if order exists)
   💾 Creating receipt in database
   ✅ Receipt created successfully
   💾 Creating receipt items (if order has items)
   ✅ Receipt items created successfully
   🎉 Payment processed successfully
   ```

2. **Supabase Tables:**
   - `receipts` table should have a new row with:
     - `payment_id` = Square payment ID
     - `amount` = Payment amount (converted from cents)
     - `currency` = Payment currency
   
   - `receipt_items` table should have rows (if order had line items) with:
     - `receipt_id` = UUID from receipts table
     - `item_name` = Item name from order
     - `item_price` = Item price (converted from cents)
     - `quantity` = Item quantity

### ❌ Error Handling

The webhook will log errors clearly:
- `❌ Payment ID not found in webhook event` - Missing payment ID
- `❌ Failed to fetch payment` - Square API error
- `⚠️ Failed to fetch order details` - Order fetch failed (non-fatal)
- `❌ Failed to create receipt items` - Items creation failed (non-fatal)
- `❌ Failed to process payment.created event` - Overall failure

## Testing Checklist

- [ ] API server is running
- [ ] Supabase is configured and connected
- [ ] Square credentials are configured
- [ ] Webhook endpoint is accessible
- [ ] Test payment exists in Square sandbox
- [ ] Webhook event is sent
- [ ] Logs show successful processing
- [ ] Receipt appears in Supabase receipts table
- [ ] Receipt items appear (if order had items)

## Common Issues

**"Payment ID not found"**
- Make sure the webhook payload includes `data.object.payment.id`

**"Square API error"**
- Verify Square access token is correct
- Check that payment ID exists in Square sandbox
- Ensure payment ID format is correct

**"Supabase is not configured"**
- Check `.env` file has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- Verify Supabase connection on API startup

**"Receipt already exists"**
- This is expected if webhook fires multiple times
- The handler will return the existing receipt (idempotent)

## Next Steps

Once testing is successful, you can:
1. Set up Square webhook in Square Dashboard to point to your API
2. Use ngrok or similar tool to expose local API for webhook delivery
3. Monitor logs for real payment events

