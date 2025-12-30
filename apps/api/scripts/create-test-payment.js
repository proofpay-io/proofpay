/**
 * Create a test payment in Square Sandbox
 * This script creates a test payment using Square's test card
 * 
 * Usage: node scripts/create-test-payment.js
 */

import { SquareClient, SquareEnvironment } from 'square';
import dotenv from 'dotenv';

dotenv.config();

const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
const squareEnvironment = process.env.SQUARE_ENVIRONMENT || 'sandbox';

if (!squareAccessToken) {
  console.error('❌ SQUARE_ACCESS_TOKEN not found in .env file');
  process.exit(1);
}

const client = new SquareClient({
  accessToken: squareAccessToken,
  environment: squareEnvironment === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
});

async function createTestPayment() {
  try {
    console.log('🔄 Creating test payment in Square Sandbox...\n');

    // Square test card numbers for sandbox
    // See: https://developer.squareup.com/docs/testing/test-values
    const testCardNumber = '4111111111111111'; // Visa test card
    const testCardExpiry = '12/25'; // Any future date
    const testCardCVV = '123';
    const testCardPostalCode = '94103';

    // Create a payment request
    // Note: In Square, you typically create payments through the Payments API
    // For testing, we'll use the CreatePayment endpoint
    
    // Square requires a location ID for payments
    // Let's try to get locations using the correct API structure
    console.log('📡 Fetching locations...');
    
    // Square requires a location ID for payments
    // Get locations first - try different API access patterns
    let locationId = null;
    try {
      console.log('📡 Fetching locations...');
      
      // Access locations API - check both possible patterns
      let locationsResponse;
      if (client.locationsApi) {
        locationsResponse = await client.locationsApi.listLocations();
      } else if (client.locations) {
        locationsResponse = await client.locations.listLocations();
      } else {
        // Try direct property access
        const locations = client.locations || client.locationsApi;
        if (locations && typeof locations.listLocations === 'function') {
          locationsResponse = await locations.listLocations();
        } else {
          throw new Error('Could not access locations API. Make sure you have at least one location in your Square account.');
        }
      }
      
      const locations = locationsResponse.result?.locations;
      
      if (locations && locations.length > 0) {
        locationId = locations[0].id;
        console.log(`✅ Using location: ${locationId}\n`);
      } else {
        throw new Error('No locations found');
      }
    } catch (locationError) {
      console.error('❌ Error fetching locations:', locationError.message);
      console.log('\n💡 You need at least one location in your Square account.');
      console.log('   Go to: https://developer.squareup.com/apps');
      console.log('   Select your app → Locations → Create a location');
      console.log('   Then try again.\n');
      throw locationError;
    }

    // Square's CreatePayment API requires a card nonce
    // For server-side testing, we use Square's test nonce
    // Square provides test nonces: https://developer.squareup.com/docs/testing/test-values
    
    console.log('💳 Creating payment with Square test nonce...');
    console.log('   Using test nonce: cnon:card-nonce-ok\n');
    
    // Create payment request
    const paymentRequest = {
      sourceId: 'cnon:card-nonce-ok', // Square test nonce for successful payment
      idempotencyKey: `test-payment-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      amountMoney: {
        amount: 1000, // $10.00 in cents
        currency: 'USD',
      },
      locationId: locationId, // Required
      note: 'Test payment for ProofPay webhook testing',
    };

    // Access payments API - use the same pattern as in square.js (paymentsApi)
    const paymentResponse = await client.paymentsApi.createPayment(paymentRequest);
    
    const payment = paymentResponse.result.payment;
    
    console.log('\n✅ Payment created successfully!');
    console.log('─'.repeat(60));
    console.log(`Payment ID: ${payment.id}`);
    console.log(`Order ID: ${order.id}`);
    console.log(`Amount: $${(payment.amountMoney.amount / 100).toFixed(2)} ${payment.amountMoney.currency}`);
    console.log(`Status: ${payment.status}`);
    console.log('─'.repeat(60));
    console.log('\n📋 Use this payment ID to test the webhook:');
    console.log(`   ${payment.id}\n`);
    console.log('🧪 Test webhook command:');
    console.log(`   $paymentId = "${payment.id}"`);
    console.log(`   $body = @{`);
    console.log(`       type = "payment.created"`);
    console.log(`       event_id = "test-event-$(Get-Date -Format 'yyyyMMddHHmmss')"`);
    console.log(`       merchant_id = "test-merchant"`);
    console.log(`       data = @{`);
    console.log(`           type = "payment"`);
    console.log(`           id = "payment-event-id"`);
    console.log(`           object = @{`);
    console.log(`               payment = @{`);
    console.log(`                   id = $paymentId`);
    console.log(`               }`);
    console.log(`           }`);
    console.log(`       }`);
    console.log(`   } | ConvertTo-Json -Depth 5`);
    console.log(`   Invoke-RestMethod -Uri http://localhost:4000/v1/webhooks/square -Method POST -Body $body -ContentType "application/json"`);

  } catch (error) {
    console.error('\n❌ Error creating test payment:');
    if (error.errors && error.errors.length > 0) {
      error.errors.forEach(err => {
        console.error(`   ${err.category}: ${err.detail || err.message}`);
      });
    } else {
      console.error(`   ${error.message}`);
    }
    console.error('\n💡 Troubleshooting:');
    console.error('   - Make sure SQUARE_ACCESS_TOKEN is set in .env');
    console.error('   - Verify you have at least one location in Square');
    console.error('   - Check that you\'re using sandbox credentials');
    process.exit(1);
  }
}

createTestPayment();

