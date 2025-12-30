# Database Migrations

This directory contains SQL migration files for creating and updating the Supabase database schema.

## Running Migrations

### Option 1: Using Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://app.supabase.com
2. Navigate to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of `001_create_receipts_tables.sql`
5. Click **Run** to execute the migration
6. Verify tables were created by going to **Table Editor**

### Option 2: Using Supabase CLI

If you have Supabase CLI installed:

```bash
supabase db push
```

### Option 3: Using the API (Programmatic)

You can also run migrations programmatically through the API, but the Supabase Dashboard is the recommended approach for initial setup.

## Migration Files

- `001_create_receipts_tables.sql` - Creates the receipts and receipt_items tables with all necessary indexes, triggers, and RLS policies.

## Table Structure

### receipts
- `id` (UUID, Primary Key) - Auto-generated unique identifier
- `payment_id` (TEXT, Unique) - External payment identifier
- `amount` (NUMERIC) - Payment amount (2 decimal places)
- `currency` (TEXT) - Currency code (default: 'USD')
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Record last update timestamp

### receipt_items
- `id` (UUID, Primary Key) - Auto-generated unique identifier
- `receipt_id` (UUID, Foreign Key) - References receipts.id
- `item_name` (TEXT) - Name/description of the item
- `item_price` (NUMERIC) - Price per item (2 decimal places)
- `quantity` (INTEGER) - Quantity of items (default: 1)
- `created_at` (TIMESTAMP) - Record creation timestamp
- `updated_at` (TIMESTAMP) - Record last update timestamp

## Verification

After running the migration, verify the tables exist:

1. Go to **Table Editor** in Supabase Dashboard
2. You should see both `receipts` and `receipt_items` tables
3. Check that the columns match the structure above
4. Verify foreign key relationship between receipt_items.receipt_id and receipts.id

