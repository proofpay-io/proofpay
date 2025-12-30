# API Deployment Guide

## Vercel Deployment (Recommended)

Vercel provides a permanent, production-ready URL for your API. See `VERCEL_DEPLOYMENT.md` for detailed instructions.

**Quick Start:**
1. Sign up at https://vercel.com
2. Import your project
3. Set root directory to `apps/api`
4. Add environment variables
5. Deploy

**Your webhook URL will be:**
```
https://your-project.vercel.app/v1/webhooks/square
```

## Local Development

For local development, use:

```bash
cd apps/api
npm run dev
```

The API runs on `http://localhost:4000`

## Environment Variables

Required environment variables:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SQUARE_ACCESS_TOKEN`
- `SQUARE_ENVIRONMENT` (optional, defaults to 'sandbox')

## Webhook Configuration

Once deployed, configure Square webhook:
- **URL:** `https://your-deployment-url/v1/webhooks/square`
- **Event:** `payment.created`

