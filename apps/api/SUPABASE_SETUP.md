# Supabase Setup Guide

## Required Information

To connect the API to Supabase, you need the following information from your Supabase project:

### 1. Supabase Project URL
- This is your project's API URL
- Format: `https://xxxxxxxxxxxxx.supabase.co`

### 2. Service Role Key
- This is the **service_role** key (NOT the anon/public key)
- This key has admin privileges and bypasses Row Level Security (RLS)
- ⚠️ **IMPORTANT**: Never expose this key in client-side code or public repositories

## How to Get These Values

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Sign in and select your project (or create a new one)
3. Navigate to **Settings** → **API**
4. Find the following:
   - **Project URL**: Copy the "Project URL" value
   - **Service Role Key**: Copy the "service_role" key (it's in the "Project API keys" section, labeled as "service_role secret")

## Setup Steps

1. Create a `.env` file in the `apps/api/` directory:
   ```bash
   cd apps/api
   cp .env.example .env
   ```

2. Edit the `.env` file and add your values:
   ```env
   SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   PORT=4000
   ```

3. Restart the API server:
   ```bash
   npm run dev
   ```

4. Verify the connection:
   - Check the server logs for: `✅ Database connection successful`
   - If you see warnings, check that your credentials are correct

## Security Notes

- The `.env` file is already in `.gitignore` and will not be committed
- The service role key has full database access - keep it secure
- Never commit the service role key to version control
- Use environment variables in production deployments

## Usage

Once configured, you can use the Supabase client in your API code:

```javascript
import { supabase, isConfigured } from './lib/db.js';

// Check if Supabase is configured
if (isConfigured()) {
  // Use supabase client for database operations
  const { data, error } = await supabase
    .from('your_table')
    .select('*');
}
```

