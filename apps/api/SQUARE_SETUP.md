# Square SDK Setup Guide

## Required Square Credentials

To integrate Square payment data fetching, you need the following credentials from your Square Developer account:

### 1. Square Sandbox Access Token
- This is your **Sandbox Access Token** (for testing/development)
- Format: A long string starting with `EAAA...` or `sandbox-...`
- ⚠️ **IMPORTANT**: Use sandbox tokens for development, production tokens for live payments

### 2. Square Environment
- Set to `sandbox` for development/testing
- Set to `production` for live payments (requires production access token)

## How to Get Your Square Sandbox Access Token

1. **Go to Square Developer Dashboard**
   - Visit: https://developer.squareup.com/apps
   - Sign in with your Square account

2. **Select or Create an Application**
   - If you don't have an app, click **"New Application"**
   - Give it a name (e.g., "ProofPay API")
   - Select your business location

3. **Get Sandbox Credentials**
   - In your application dashboard, go to **Credentials** (left sidebar)
   - Under **Sandbox**, find **Access Token**
   - Click **Show** to reveal the token
   - Copy the entire token (it's a long string)

4. **For Production (Later)**
   - Switch to **Production** tab in Credentials
   - Follow the same process to get production access token
   - ⚠️ Only use production tokens when ready for live payments

## Setup Steps

1. **Add credentials to `.env` file** in `apps/api/`:
   ```env
   SQUARE_ACCESS_TOKEN=EAAAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   SQUARE_ENVIRONMENT=sandbox
   ```

2. **Restart the API server**:
   ```bash
   npm run dev
   ```

3. **Verify Square is configured**:
   - Check server logs for any Square-related errors
   - The API will start even without Square credentials (with warnings)

## Usage

Once configured, you can use the Square service in your API:

```javascript
import { getPaymentById, getOrderById, isConfigured } from './lib/square.js';

// Check if Square is configured
if (isConfigured()) {
  // Fetch a payment by ID
  const payment = await getPaymentById('payment_id_here');
  
  // Fetch an order by ID
  const order = await getOrderById('order_id_here');
}
```

## Available Functions

### `getPaymentById(paymentId)`
Fetches a payment from Square by its payment ID.

**Parameters:**
- `paymentId` (string) - The Square payment ID

**Returns:**
- `{ success: true, payment: {...} }` - Payment object with all details

**Throws:**
- Error if Square is not configured
- Error if payment ID is missing
- Error if payment is not found or API call fails

### `getOrderById(orderId)`
Fetches an order from Square by its order ID.

**Parameters:**
- `orderId` (string) - The Square order ID

**Returns:**
- `{ success: true, order: {...} }` - Order object with all details

**Throws:**
- Error if Square is not configured
- Error if order ID is missing
- Error if order is not found or API call fails

## Security Notes

- The `.env` file is already in `.gitignore` and will not be committed
- Never commit Square access tokens to version control
- Use sandbox tokens for development
- Only use production tokens in secure production environments
- Access tokens have full API access - keep them secure

## Testing

To test the Square integration:

1. Make sure you have a valid sandbox access token
2. Use Square's test payment IDs from their documentation
3. Test with the Square Sandbox test cards: https://developer.squareup.com/docs/testing/test-values

## Troubleshooting

**"Square is not configured" error:**
- Check that `SQUARE_ACCESS_TOKEN` is set in `.env`
- Verify the token is correct and not expired
- Restart the API server after adding credentials

**"Square API error" messages:**
- Verify your access token is valid
- Check that you're using the correct environment (sandbox vs production)
- Ensure the payment/order ID exists in your Square account
- Check Square API documentation for error code meanings

