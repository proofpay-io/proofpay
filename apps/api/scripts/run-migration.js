import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read the migration file
const migrationPath = join(__dirname, '../migrations/001_create_receipts_tables.sql');
const migrationSQL = readFileSync(migrationPath, 'utf-8');

async function runMigration() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('❌ Supabase is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  console.log('🔄 Running migration: 001_create_receipts_tables.sql');
  console.log('📡 Connecting to Supabase...\n');
  
  try {
    // Use Supabase REST API to execute SQL
    // The REST API endpoint for running SQL is /rest/v1/rpc/exec_sql
    // But actually, we need to use the PostgREST API or the management API
    
    // Alternative: Use fetch to call Supabase's SQL execution endpoint
    // Note: Supabase doesn't expose a direct SQL execution endpoint via REST
    // The best way is through the Dashboard SQL Editor or using psql
    
    // For now, we'll provide clear instructions and the SQL
    console.log('⚠️  Note: Supabase JS client cannot execute raw SQL migrations directly.');
    console.log('⚠️  Please run the migration using the Supabase Dashboard:\n');
    console.log('   1. Go to: https://app.supabase.com');
    console.log('   2. Select your project');
    console.log('   3. Navigate to: SQL Editor (left sidebar)');
    console.log('   4. Click: New Query');
    console.log('   5. Paste the SQL below and click: Run\n');
    console.log('─'.repeat(70));
    console.log(migrationSQL);
    console.log('─'.repeat(70));
    console.log('\n✅ After running, verify tables in Table Editor');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

runMigration();
