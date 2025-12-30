# How to Find Receipts in Supabase

## Step 1: Navigate to Table Editor

1. **Go to Supabase Dashboard:**
   - Visit: https://app.supabase.com
   - Sign in and select your project: `ztqdsxgvgzlosufkdskk`

2. **Open Table Editor:**
   - Click **Table Editor** in the left sidebar
   - This is where you'll see all your database tables

## Step 2: Look for Receipts Table

You should see two tables:
- **`receipts`** - Main receipts table
- **`receipt_items`** - Individual items in receipts

## Step 3: View Receipts

1. Click on the **`receipts`** table
2. You should see columns:
   - `id` (UUID)
   - `payment_id` (TEXT) - This is the Square payment ID
   - `amount` (NUMERIC)
   - `currency` (TEXT)
   - `created_at` (TIMESTAMP)
   - `updated_at` (TIMESTAMP)

3. If the table is empty, no receipts have been created yet

## Step 4: Check if Tables Exist

If you don't see the tables, they may not have been created yet. Run:

```bash
cd apps/api
npm run verify-tables
```

This will tell you if the tables exist.

## Step 5: Create Tables (If Missing)

If tables don't exist, you need to run the migration:

1. **Go to Supabase SQL Editor:**
   - Click **SQL Editor** in the left sidebar
   - Click **New Query**

2. **Run the Migration:**
   - Open: `apps/api/migrations/001_create_receipts_tables.sql`
   - Copy the entire SQL file
   - Paste into SQL Editor
   - Click **Run**

3. **Verify Tables Created:**
   - Go back to **Table Editor**
   - You should now see `receipts` and `receipt_items` tables

## Step 6: View Receipt Items

1. Click on the **`receipt_items`** table
2. This shows individual line items from orders
3. Each item has:
   - `receipt_id` - Links to the receipt
   - `item_name` - Name of the item
   - `item_price` - Price per item
   - `quantity` - Quantity purchased

## Troubleshooting

### Tables Don't Appear
- Run the migration SQL in Supabase SQL Editor
- See: `apps/api/MIGRATION_INSTRUCTIONS.md`

### Tables Exist But No Data
- Check if webhook was actually received
- Check API logs for errors
- Verify Square payment ID was correct
- Make sure webhook processed successfully

### Can't Find Table Editor
- Make sure you're in the correct project
- Table Editor is in the left sidebar
- If you don't see it, check your project permissions

## Quick Check Commands

**Verify tables exist:**
```bash
cd apps/api
npm run verify-tables
```

**Check API logs for webhook processing:**
- Look for: `✅ Receipt created successfully`
- Look for: `🎉 Payment processed successfully`

**Query receipts directly:**
You can also use Supabase SQL Editor to query:
```sql
SELECT * FROM receipts ORDER BY created_at DESC;
SELECT * FROM receipt_items ORDER BY created_at DESC;
```

