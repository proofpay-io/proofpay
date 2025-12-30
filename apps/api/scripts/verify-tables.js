import { supabase, isConfigured } from '../lib/db.js';

async function verifyTables() {
  if (!isConfigured()) {
    console.error('❌ Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  if (!supabase) {
    console.error('❌ Supabase client not initialized');
    process.exit(1);
  }

  console.log('🔍 Verifying tables exist...\n');

  try {
    // Try to query the receipts table
    const { data: receiptsData, error: receiptsError } = await supabase
      .from('receipts')
      .select('id')
      .limit(1);

    if (receiptsError) {
      if (receiptsError.code === 'PGRST116' || receiptsError.message?.includes('schema cache')) {
        console.log('❌ receipts table does not exist');
        console.log('   Please run the migration first using: npm run migrate');
        process.exit(1);
      }
      throw receiptsError;
    }

    console.log('✅ receipts table exists');

    // Try to query the receipt_items table
    const { data: itemsData, error: itemsError } = await supabase
      .from('receipt_items')
      .select('id')
      .limit(1);

    if (itemsError) {
      if (itemsError.code === 'PGRST116' || itemsError.message?.includes('schema cache')) {
        console.log('❌ receipt_items table does not exist');
        console.log('   Please run the migration first using: npm run migrate');
        process.exit(1);
      }
      throw itemsError;
    }

    console.log('✅ receipt_items table exists\n');
    console.log('🎉 All tables verified successfully!');
    console.log('   You can now view them in Supabase Dashboard → Table Editor');

  } catch (error) {
    console.error('❌ Error verifying tables:', error.message);
    process.exit(1);
  }
}

verifyTables();

