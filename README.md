# ProofPay

Monorepo for ProofPay - Turns Payments Into Proofs Of Purchase.

## Structure

- `apps/api` - Fastify API server (handles Square webhooks, creates receipts in Supabase)
- `apps/web` - Next.js web application

## Quick Start

### Install Dependencies

```bash
npm install
```

### Run Development Servers

```bash
# Run all apps
npm run dev

# Or run individually:
cd apps/api && npm run dev    # API on http://localhost:4000
cd apps/web && npm run dev    # Web on http://localhost:3000
```

## API

The API handles Square webhooks and creates receipts in Supabase.

See `apps/api/README.md` for API documentation.

## Web App

The Next.js web application.

See `apps/web/README.md` for web app documentation.

## Deployment

- **API**: Deployed to Vercel (see `apps/api/VERCEL_DEPLOYMENT.md`)
- **Web**: Deploy to Vercel or your preferred hosting

## Environment Variables

### API (`apps/api/.env`)

- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key
- `SQUARE_ACCESS_TOKEN` - Square API access token
- `SQUARE_ENVIRONMENT` - `sandbox` or `production`
- `PORT` - Server port (default: 4000)

### Web (`apps/web/.env.local`)

- `NEXT_PUBLIC_API_URL` - API URL (optional, defaults to `http://localhost:4000`)

## License

Private
