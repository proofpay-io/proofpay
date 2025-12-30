import Fastify from 'fastify';
import cors from '@fastify/cors';
import { supabase, testConnection } from './lib/db.js';
import { handleSquareWebhook, isValidWebhookPayload } from './lib/webhooks.js';

const fastify = Fastify({
  logger: true
});

// Start server
const start = async () => {
  try {
    // Initialize database connection
    fastify.log.info('🔌 Checking Supabase configuration...');
    const dbConnection = await testConnection();
    
    if (dbConnection.connected) {
      fastify.log.info('✅ Database connection successful');
    } else {
      fastify.log.warn(`⚠️ ${dbConnection.error}`);
      fastify.log.warn('⚠️ Server will continue, but database operations will not work until Supabase is configured.');
      fastify.log.warn('⚠️ Create a .env file in apps/api/ with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
    }

    // Register CORS plugin - enable for all origins
    await fastify.register(cors, {
      origin: true // Allow all origins
    });

    // Health check route
    fastify.get('/health', async (request, reply) => {
      return { status: 'ok', service: 'proofpay-api' };
    });

    // Square webhook route
    // ⚠️ IMPORTANT: This route MUST NOT require authentication
    // Square webhooks are sent from Square's servers and do not include auth tokens
    // This route is explicitly public and bypasses any authentication middleware
    fastify.post('/v1/webhooks/square', {
      // Explicitly disable any potential auth hooks
      config: {
        // Mark this route as public - no auth required
        public: true,
        // Explicitly bypass authentication
        skipAuth: true,
      }
    }, async (request, reply) => {
      try {
        // Log that webhook endpoint was hit
        fastify.log.info('🔔 Square webhook endpoint hit', {
          method: request.method,
          url: request.url,
          headers: {
            'content-type': request.headers['content-type'],
            'user-agent': request.headers['user-agent'],
          },
        });

        const payload = request.body;

        // Validate payload structure
        if (!isValidWebhookPayload(payload)) {
          fastify.log.warn('⚠️ Invalid webhook payload structure', { payload });
          return reply.code(400).send({
            error: 'Invalid webhook payload',
            message: 'Payload must be a valid Square webhook event',
          });
        }

        // Handle single event or array of events
        const events = Array.isArray(payload) ? payload : [payload];
        const results = [];

        for (const event of events) {
          // handleSquareWebhook is now async, so we need to await it
          const result = await handleSquareWebhook(event, fastify.log);
          results.push(result);
        }

        // Return success response (Square expects 200)
        // Always return 200 to acknowledge receipt - Square will retry if we return error codes
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
    
    const port = process.env.PORT || 4000;
    await fastify.listen({ port, host: '0.0.0.0' });
    fastify.log.info(`🚀 Server listening on port ${port}`);
    fastify.log.info(`📍 Health check available at http://localhost:${port}/health`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

