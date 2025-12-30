/**
 * List existing payments from Square Sandbox
 * This helps you find a payment ID to test the webhook
 * 
 * Usage: node scripts/list-payments.js
 */

import { getClient } from '../lib/square.js';

async function listPayments() {
  try {
    console.log('🔄 Fetching payments from Square Sandbox...\n');

    const client = getClient();

    // List payments - use client.payments.list() method
    const paymentsResponse = await client.payments.list({
      limit: 10,
      sortOrder: 'DESC',
    });
    
    const payments = paymentsResponse.result?.payments || [];

    if (payments.length === 0) {
      console.log('ℹ️  No payments found in your Square account.');
      console.log('\n💡 To create a test payment:');
      console.log('   1. Go to: https://squareupsandbox.com');
      console.log('   2. Sign in with your sandbox account');
      console.log('   3. Create a test transaction');
      console.log('   4. Run this script again to see the payment ID\n');
      return;
    }

    console.log(`✅ Found ${payments.length} payment(s):\n`);
    console.log('─'.repeat(80));

    payments.forEach((payment, index) => {
      const amount = payment.amountMoney?.amount || 0;
      const currency = payment.amountMoney?.currency || 'USD';
      const amountFormatted = `$${(amount / 100).toFixed(2)} ${currency}`;
      
      console.log(`\n${index + 1}. Payment ID: ${payment.id}`);
      console.log(`   Amount: ${amountFormatted}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Created: ${payment.createdAt || 'N/A'}`);
      if (payment.orderId) {
        console.log(`   Order ID: ${payment.orderId}`);
      }
    });

    console.log('\n' + '─'.repeat(80));
    console.log('\n📋 To test the webhook, use one of these payment IDs:');
    console.log(`   Example: ${payments[0].id}\n`);
    console.log('🧪 Test webhook command:');
    console.log(`   $paymentId = "${payments[0].id}"`);
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
    console.error('\n❌ Error fetching payments:');
    if (error.errors && error.errors.length > 0) {
      error.errors.forEach(err => {
        console.error(`   ${err.category}: ${err.detail || err.message}`);
      });
    } else {
      console.error(`   ${error.message}`);
    }
    console.error('\n💡 Troubleshooting:');
    console.error('   - Make sure SQUARE_ACCESS_TOKEN is set in .env');
    console.error('   - Verify you\'re using sandbox credentials');
    console.error('   - Check that your Square account has payments');
    process.exit(1);
  }
}

listPayments();
