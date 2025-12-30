# Database Migration Instructions

## Quick Start

To create the `receipts` and `receipt_items` tables in your Supabase database:

### Step 1: Run the Migration

1. **Open Supabase Dashboard**
   - Go to: https://app.supabase.com
   - Select your project: `ztqdsxgvgzlosufkdskk`

2. **Open SQL Editor**
   - Click **SQL Editor** in the left sidebar
   - Click **New Query** button

3. **Run the Migration**
   - Copy the entire contents of `migrations/001_create_receipts_tables.sql`
   - Paste it into the SQL Editor
   - Click **Run** (or press Ctrl+Enter)

4. **Verify Success**
   - You should see: "Success. No rows returned"
   - This means the tables were created successfully

### Step 2: Verify Tables Exist

**Option A: Using Supabase Dashboard**
1. Click **Table Editor** in the left sidebar
2. You should see both tables:
   - `receipts`
   - `receipt_items`

**Option B: Using Verification Script**
```bash
cd apps/api
npm run verify-tables
```

You should see:
```
✅ receipts table exists
✅ receipt_items table exists
🎉 All tables verified successfully!
```

## Table Structure

### receipts
- `id` (UUID) - Primary key, auto-generated
- `payment_id` (TEXT) - Unique payment identifier
- `amount` (NUMERIC) - Payment amount (2 decimal places)
- `currency` (TEXT) - Currency code (default: 'USD')
- `created_at` (TIMESTAMP) - Auto-set on creation
- `updated_at` (TIMESTAMP) - Auto-updated on changes

### receipt_items
- `id` (UUID) - Primary key, auto-generated
- `receipt_id` (UUID) - Foreign key to receipts.id
- `item_name` (TEXT) - Item name/description
- `item_price` (NUMERIC) - Price per item (2 decimal places)
- `quantity` (INTEGER) - Quantity (default: 1)
- `created_at` (TIMESTAMP) - Auto-set on creation
- `updated_at` (TIMESTAMP) - Auto-updated on changes

## Features Included

✅ Foreign key relationship (receipt_items → receipts)  
✅ Automatic timestamps (created_at, updated_at)  
✅ Auto-update triggers for updated_at  
✅ Indexes for performance  
✅ Row Level Security (RLS) enabled  
✅ Service role policies (allows API access)

## Troubleshooting

**If tables don't appear:**
- Make sure you ran the SQL in the correct project
- Check for any error messages in the SQL Editor
- Try refreshing the Table Editor page

**If verification script fails:**
- Ensure your `.env` file has correct Supabase credentials
- Make sure the migration was run successfully
- Check that you're in the `apps/api` directory

