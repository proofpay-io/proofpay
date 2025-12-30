# Webhook Authentication Configuration

## Important: Webhook Route is Public

The `/v1/webhooks/square` route is **explicitly configured to bypass authentication**.

### Why?

Square webhooks are sent from Square's servers and **do not include authentication tokens**. Square expects:
- HTTP 200 response for successful receipt
- No authentication required
- Public endpoint accessible from Square's infrastructure

### Current Configuration

The webhook route is configured with:
```javascript
fastify.post('/v1/webhooks/square', {
  config: {
    public: true,      // Mark as public route
    skipAuth: true,   // Explicitly bypass authentication
  }
}, async (request, reply) => {
  // ... handler code
});
```

### Future-Proofing

If you add authentication middleware in the future, ensure it:
1. Checks `request.routeConfig?.config?.skipAuth` or `request.routeConfig?.config?.public`
2. Skips authentication for routes marked with `skipAuth: true`
3. Does NOT apply to `/v1/webhooks/square` route

### Example Auth Middleware Pattern

If you add auth later, use this pattern:

```javascript
fastify.addHook('onRequest', async (request, reply) => {
  // Skip auth for public routes
  if (request.routeConfig?.config?.skipAuth || request.routeConfig?.config?.public) {
    return; // Skip authentication
  }
  
  // Apply authentication for other routes
  // ... your auth logic here
});
```

### Verification

The webhook route:
- ✅ Returns HTTP 200 (verified)
- ✅ Does not require authentication
- ✅ Accepts POST requests from any origin (CORS enabled)
- ✅ Logs all webhook events

### Testing

Test that the webhook returns 200:
```bash
curl -X POST http://localhost:4000/v1/webhooks/square \
  -H "Content-Type: application/json" \
  -d '{"type":"payment.created","event_id":"test"}'
```

Expected: HTTP 200 response

