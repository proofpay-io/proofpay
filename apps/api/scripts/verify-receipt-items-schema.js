/**
 * Verify receipt_items table schema and data
 * Usage: node scripts/verify-receipt-items-schema.js
 */

import { supabase, isConfigured } from '../lib/db.js';

async function verifySchema() {
  if (!isConfigured() || !supabase) {
    console.error('❌ Supabase is not configured');
    process.exit(1);
  }

  console.log('🔍 Verifying receipt_items table schema and data...\n');

  try {
    // Step 1: Check table structure by querying information_schema
    console.log('📋 Step 1: Checking table structure...\n');
    
    // Query to get column information
    const { data: columns, error: columnsError } = await supabase.rpc('exec_sql', {
      sql: `
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'receipt_items'
        ORDER BY ordinal_position;
      `
    }).catch(async () => {
      // If RPC doesn't work, try direct query
      const { data: sample, error } = await supabase
        .from('receipt_items')
        .select('*')
        .limit(1);
      
      if (error) {
        console.error('❌ Error checking table:', error.message);
        return { data: null, error };
      }
      
      if (sample && sample.length > 0) {
        console.log('✅ Table exists. Columns found in sample row:');
        console.log('   ', Object.keys(sample[0]).join(', '));
        return { data: sample[0], error: null };
      }
      
      return { data: null, error: null };
    });

    // Step 2: Get a sample of actual data
    console.log('\n📊 Step 2: Checking actual data...\n');
    const { data: sampleItems, error: sampleError } = await supabase
      .from('receipt_items')
      .select('*')
      .limit(5)
      .order('created_at', { ascending: false });

    if (sampleError) {
      console.error('❌ Error fetching sample items:', sampleError.message);
      process.exit(1);
    }

    if (!sampleItems || sampleItems.length === 0) {
      console.log('⚠️  No receipt_items found in database.');
      console.log('   This might be why item_name is missing - there are no items to display.');
      return;
    }

    console.log(`✅ Found ${sampleItems.length} sample item(s):\n`);
    sampleItems.forEach((item, idx) => {
      console.log(`   Item ${idx + 1}:`);
      console.log(`      ID: ${item.id}`);
      console.log(`      Receipt ID: ${item.receipt_id}`);
      console.log(`      Item Name: ${item.item_name || '❌ MISSING'}`);
      console.log(`      Item Price: ${item.item_price}`);
      console.log(`      Quantity: ${item.quantity}`);
      console.log(`      All Keys: ${Object.keys(item).join(', ')}`);
      console.log('');
    });

    // Step 3: Check if item_name column exists
    const firstItem = sampleItems[0];
    const hasItemName = 'item_name' in firstItem;
    const itemNameValue = firstItem.item_name;

    console.log('🔍 Step 3: Column verification...\n');
    if (hasItemName) {
      console.log('✅ Column "item_name" EXISTS in the table');
      if (itemNameValue) {
        console.log(`✅ item_name has value: "${itemNameValue}"`);
      } else {
        console.log('⚠️  item_name is NULL or empty');
      }
    } else {
      console.log('❌ Column "item_name" DOES NOT EXIST in the table');
      console.log('   This is the problem! The column might be named differently.');
    }

    // Step 4: Test nested query
    console.log('\n🔍 Step 4: Testing nested query (same as API uses)...\n');
    if (sampleItems.length > 0) {
      const receiptId = sampleItems[0].receipt_id;
      const { data: receiptWithItems, error: nestedError } = await supabase
        .from('receipts')
        .select(`
          *,
          receipt_items (
            id,
            receipt_id,
            item_name,
            item_price,
            quantity,
            created_at,
            updated_at
          )
        `)
        .eq('id', receiptId)
        .single();

      if (nestedError) {
        console.error('❌ Error with nested query:', nestedError.message);
      } else if (receiptWithItems) {
        console.log('✅ Nested query successful');
        console.log(`   Receipt ID: ${receiptWithItems.id}`);
        console.log(`   Items count: ${receiptWithItems.receipt_items?.length || 0}`);
        if (receiptWithItems.receipt_items && receiptWithItems.receipt_items.length > 0) {
          const firstNestedItem = receiptWithItems.receipt_items[0];
          console.log(`   First item keys: ${Object.keys(firstNestedItem).join(', ')}`);
          console.log(`   First item item_name: ${firstNestedItem.item_name || '❌ MISSING'}`);
        }
      }
    }

    // Step 5: Count items with missing item_name
    console.log('\n📊 Step 5: Statistics...\n');
    const { data: allItems, error: allError } = await supabase
      .from('receipt_items')
      .select('id, item_name');

    if (!allError && allItems) {
      const total = allItems.length;
      const withName = allItems.filter(item => item.item_name && item.item_name.trim() !== '').length;
      const withoutName = total - withName;
      
      console.log(`   Total items: ${total}`);
      console.log(`   Items with item_name: ${withName}`);
      console.log(`   Items without item_name: ${withoutName}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

verifySchema();

