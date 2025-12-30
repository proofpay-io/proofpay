import { SquareClient, SquareEnvironment } from 'square';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Square configuration from environment variables
const squareAccessToken = process.env.SQUARE_ACCESS_TOKEN;
const squareEnvironment = process.env.SQUARE_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'production'

// Initialize Square client
let squareClient = null;

if (squareAccessToken) {
  squareClient = new SquareClient({
    accessToken: squareAccessToken,
    environment: squareEnvironment === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox,
  });
}

/**
 * Check if Square is configured
 * @returns {boolean}
 */
export const isConfigured = () => {
  return !!squareAccessToken;
};

/**
 * Get the Square client instance
 * @returns {SquareClient|null}
 */
export const getClient = () => {
  if (!isConfigured()) {
    throw new Error('Square is not configured. Please set SQUARE_ACCESS_TOKEN in .env');
  }
  return squareClient;
};

/**
 * Fetch a payment by ID
 * @param {string} paymentId - The Square payment ID
 * @returns {Promise<Object>} Payment object
 */
export const getPaymentById = async (paymentId) => {
  if (!isConfigured()) {
    throw new Error('Square is not configured. Please set SQUARE_ACCESS_TOKEN in .env');
  }

  if (!paymentId) {
    throw new Error('Payment ID is required');
  }

  try {
    const client = getClient();
    const { result, statusCode } = await client.paymentsApi.getPayment(paymentId);

    if (statusCode !== 200) {
      throw new Error(`Square API returned status code: ${statusCode}`);
    }

    return {
      success: true,
      payment: result.payment,
    };
  } catch (error) {
    if (error.errors && error.errors.length > 0) {
      const errorMessages = error.errors.map(e => e.detail || e.message).join(', ');
      throw new Error(`Square API error: ${errorMessages}`);
    }
    throw new Error(`Failed to fetch payment: ${error.message}`);
  }
};

/**
 * Fetch an order by ID
 * @param {string} orderId - The Square order ID
 * @returns {Promise<Object>} Order object
 */
export const getOrderById = async (orderId) => {
  if (!isConfigured()) {
    throw new Error('Square is not configured. Please set SQUARE_ACCESS_TOKEN in .env');
  }

  if (!orderId) {
    throw new Error('Order ID is required');
  }

  try {
    const client = getClient();
    const { result, statusCode } = await client.ordersApi.retrieveOrder(orderId);

    if (statusCode !== 200) {
      throw new Error(`Square API returned status code: ${statusCode}`);
    }

    return {
      success: true,
      order: result.order,
    };
  } catch (error) {
    if (error.errors && error.errors.length > 0) {
      const errorMessages = error.errors.map(e => e.detail || e.message).join(', ');
      throw new Error(`Square API error: ${errorMessages}`);
    }
    throw new Error(`Failed to fetch order: ${error.message}`);
  }
};

