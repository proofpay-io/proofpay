/**
 * Check for receipts in Supabase
 * Usage: node scripts/check-receipts.js
 */

import { supabase, isConfigured } from '../lib/db.js';

async function checkReceipts() {
  if (!isConfigured() || !supabase) {
    console.error('❌ Supabase is not configured');
    process.exit(1);
  }

  console.log('🔍 Checking for receipts in Supabase...\n');

  try {
    // Check receipts
    const { data: receipts, error: receiptsError } = await supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (receiptsError) {
      console.error('❌ Error fetching receipts:', receiptsError.message);
      process.exit(1);
    }

    if (receipts.length === 0) {
      console.log('ℹ️  No receipts found in database.');
      console.log('\n💡 To create a receipt:');
      console.log('   1. Make sure API server is running');
      console.log('   2. Send a webhook with a valid Square payment ID');
      console.log('   3. Check API logs for processing status\n');
      return;
    }

    console.log(`✅ Found ${receipts.length} receipt(s):\n`);
    console.log('─'.repeat(80));

    for (let i = 0; i < receipts.length; i++) {
      const receipt = receipts[i];
      console.log(`\n${i + 1}. Receipt ID: ${receipt.id}`);
      console.log(`   Payment ID: ${receipt.payment_id}`);
      console.log(`   Amount: $${receipt.amount} ${receipt.currency}`);
      console.log(`   Created: ${receipt.created_at}`);

      // Check for receipt items
      const { data: items } = await supabase
        .from('receipt_items')
        .select('*')
        .eq('receipt_id', receipt.id);

      if (items && items.length > 0) {
        console.log(`   Items: ${items.length} item(s)`);
        items.forEach((item, idx) => {
          console.log(`      ${idx + 1}. ${item.item_name} - $${item.item_price} x ${item.quantity}`);
        });
      }
    }

    console.log('\n' + '─'.repeat(80));
    console.log('\n📍 View in Supabase:');
    console.log('   https://app.supabase.com/project/ztqdsxgvgzlosufkdskk/editor');
    console.log('   → Table Editor → receipts');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkReceipts();

