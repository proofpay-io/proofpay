// Square client for Next.js API routes
import { SquareClient, SquareEnvironment } from 'square';

// Initialize Square client - create fresh instance each time to ensure env vars are loaded
function createSquareClient(): SquareClient | null {
  const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
  const squareEnvironment = process.env.SQUARE_ENVIRONMENT || 'sandbox';

  if (!squareAccessToken) {
    return null;
  }

  return new SquareClient({
    accessToken: squareAccessToken,
    environment: squareEnvironment === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  } as any);
}

/**
 * Check if Square is configured
 */
export const isSquareConfigured = () => {
  const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
  const squareLocationId = process.env.SQUARE_LOCATION_ID;
  return !!(squareAccessToken && squareLocationId);
};

/**
 * Get the Square client instance
 */
export const getSquareClient = () => {
  const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
  
  if (!squareAccessToken) {
    throw new Error('Square is not configured. Please set SQUARE_ACCESS_TOKEN in environment variables.');
  }

  const client = createSquareClient();
  if (!client) {
    throw new Error('Square client not initialized');
  }

  // Note: ordersApi and paymentsApi are lazy-loaded by the Square SDK
  // They may not be available immediately, but will be when accessed

  return client;
};

/**
 * Get Square location ID
 */
export const getSquareLocationId = () => {
  const squareLocationId = process.env.SQUARE_LOCATION_ID;
  if (!squareLocationId) {
    throw new Error('Square location ID is not configured. Please set SQUARE_LOCATION_ID in environment variables.');
  }
  return squareLocationId;
};

/**
 * Generate a unique idempotency key
 */
export const generateIdempotencyKey = () => {
  return `demo-sale-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

