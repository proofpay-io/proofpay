# ProofPay API

Fastify API server for ProofPay - handles Square webhooks and creates receipts in Supabase.

## Quick Start

### Local Development

```bash
npm install
npm run dev
```

Server runs on `http://localhost:4000`

### Deploy to Vercel

See `VERCEL_DEPLOYMENT.md` for complete instructions.

**Quick deploy:**
1. Install Vercel CLI: `npm i -g vercel`
2. Run: `vercel` from this directory
3. Add environment variables in Vercel dashboard
4. Your API will be live at: `https://your-project.vercel.app`

## Environment Variables

Required:
- `SUPABASE_URL` - Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SQUARE_ACCESS_TOKEN` - Square sandbox/production access token
- `SQUARE_ENVIRONMENT` - `sandbox` or `production` (defaults to `sandbox`)

Optional:
- `PORT` - Server port (defaults to 4000)

## API Endpoints

- `GET /health` - Health check endpoint
- `POST /v1/webhooks/square` - Square webhook endpoint (public, no auth required)

## Documentation

- `VERCEL_DEPLOYMENT.md` - Deploy to Vercel
- `SUPABASE_SETUP.md` - Supabase configuration
- `SQUARE_SETUP.md` - Square SDK setup
- `MIGRATION_INSTRUCTIONS.md` - Database migrations
- `WEBHOOK_TESTING.md` - Webhook testing guide

## Scripts

- `npm run dev` - Start development server with auto-reload
- `npm run start` - Start production server
- `npm run migrate` - Show migration SQL
- `npm run verify-tables` - Verify database tables exist
- `npm run check-receipts` - Check for receipts in database

