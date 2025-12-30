/**
 * Test script for Square webhook endpoint
 * This simulates a payment.created webhook event
 * 
 * Usage: node scripts/test-webhook.js [payment_id]
 * 
 * If payment_id is provided, it will use that ID.
 * Otherwise, it will use a test payment ID structure.
 */

import dotenv from 'dotenv';
dotenv.config();

const paymentId = process.argv[2] || 'test-payment-id-123';

const webhookPayload = {
  type: 'payment.created',
  event_id: `test-event-${Date.now()}`,
  merchant_id: 'test-merchant-id',
  created_at: new Date().toISOString(),
  data: {
    type: 'payment',
    id: 'payment-event-id',
    object: {
      payment: {
        id: paymentId,
      },
    },
  },
};

async function testWebhook() {
  const url = `http://localhost:${process.env.PORT || 4000}/v1/webhooks/square`;
  
  console.log('🧪 Testing Square webhook endpoint...');
  console.log('📡 URL:', url);
  console.log('📦 Payload:', JSON.stringify(webhookPayload, null, 2));
  console.log('');

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(webhookPayload),
    });

    const data = await response.json();

    console.log('📊 Response Status:', response.status);
    console.log('📋 Response Body:', JSON.stringify(data, null, 2));

    if (response.status === 200) {
      console.log('\n✅ Webhook test successful!');
      if (data.results && data.results[0]?.receiptId) {
        console.log('💾 Receipt created:', data.results[0].receiptId);
      }
    } else {
      console.log('\n❌ Webhook test failed');
    }
  } catch (error) {
    console.error('❌ Error testing webhook:', error.message);
    process.exit(1);
  }
}

testWebhook();

