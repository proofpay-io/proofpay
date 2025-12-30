// Vercel serverless function entry point for Fastify
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { supabase, testConnection } from '../lib/db.js';
import { handleSquareWebhook, isValidWebhookPayload } from '../lib/webhooks.js';

// Create Fastify instance
const fastify = Fastify({
  logger: true,
  disableRequestLogging: false,
});

// Register CORS
fastify.register(cors, {
  origin: true
});

// Health check route
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', service: 'proofpay-api' };
});

// Square webhook route
fastify.post('/v1/webhooks/square', {
  config: {
    public: true,
    skipAuth: true,
  }
}, async (request, reply) => {
  try {
    fastify.log.info('🔔 Square webhook endpoint hit', {
      method: request.method,
      url: request.url,
    });

    const payload = request.body;

    if (!isValidWebhookPayload(payload)) {
      fastify.log.warn('⚠️ Invalid webhook payload structure', { payload });
      return reply.code(400).send({
        error: 'Invalid webhook payload',
        message: 'Payload must be a valid Square webhook event',
      });
    }

    const events = Array.isArray(payload) ? payload : [payload];
    const results = [];

    for (const event of events) {
      const result = await handleSquareWebhook(event, fastify.log);
      results.push(result);
    }

    fastify.log.info('✅ Webhook processed successfully', {
      processed: results.filter(r => r.processed).length,
      ignored: results.filter(r => !r.processed).length,
    });
    
    return reply.code(200).send({
      success: true,
      message: 'Webhook received',
      processed: results.filter(r => r.processed).length,
      ignored: results.filter(r => !r.processed).length,
      results,
    });
  } catch (error) {
    fastify.log.error('❌ Error processing Square webhook', error);
    return reply.code(500).send({
      error: 'Internal server error',
      message: error.message,
    });
  }
});

// Initialize database connection (non-blocking for Vercel)
testConnection().then(dbConnection => {
  if (dbConnection.connected) {
    fastify.log.info('✅ Database connection successful');
  } else {
    fastify.log.warn(`⚠️ ${dbConnection.error}`);
  }
}).catch(err => {
  fastify.log.warn('⚠️ Database connection check failed:', err.message);
});

// Export for Vercel serverless function
// @vercel/node expects a function that handles (req, res)
export default async (req, res) => {
  await fastify.ready();
  
  // @vercel/node provides Node.js-compatible req/res
  // Fastify can handle these directly
  fastify.server.emit('request', req, res);
};

