/**
 * Square Webhook Handler
 * Processes Square webhook events and creates receipts in Supabase
 */

import { getPaymentById, getOrderById } from './square.js';
import { supabase, isConfigured as isSupabaseConfigured } from './db.js';

/**
 * Convert Square amount (in cents) to decimal
 * @param {number} amountCents - Amount in cents
 * @returns {number} Amount as decimal
 */
const convertCentsToDecimal = (amountCents) => {
  if (!amountCents) return 0;
  return amountCents / 100;
};

/**
 * Create receipt in Supabase
 * @param {Object} payment - Square payment object
 * @param {Object} logger - Fastify logger instance
 * @returns {Promise<Object>} Created receipt
 */
const createReceipt = async (payment, logger) => {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured');
  }

  const paymentId = payment.id;
  const amountMoney = payment.amountMoney || {};
  const amount = convertCentsToDecimal(amountMoney.amount);
  const currency = amountMoney.currency || 'USD';

  logger.info('💾 Creating receipt in database', {
    paymentId,
    amount,
    currency,
  });

  const { data, error } = await supabase
    .from('receipts')
    .insert({
      payment_id: paymentId,
      amount: amount,
      currency: currency,
    })
    .select()
    .single();

  if (error) {
    // Check if it's a duplicate (payment_id already exists)
    if (error.code === '23505') {
      logger.warn('⚠️ Receipt already exists for this payment', { paymentId });
      // Fetch existing receipt
      const { data: existing } = await supabase
        .from('receipts')
        .select('*')
        .eq('payment_id', paymentId)
        .single();
      return existing;
    }
    throw error;
  }

  logger.info('✅ Receipt created successfully', {
    receiptId: data.id,
    paymentId: data.payment_id,
  });

  return data;
};

/**
 * Create receipt items from order line items
 * @param {string} receiptId - UUID of the receipt
 * @param {Object} order - Square order object
 * @param {Object} logger - Fastify logger instance
 * @returns {Promise<Array>} Created receipt items
 */
const createReceiptItems = async (receiptId, order, logger) => {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase is not configured');
  }

  const lineItems = order?.lineItems || [];
  
  if (lineItems.length === 0) {
    logger.info('ℹ️ No line items found in order, skipping receipt items');
    return [];
  }

  logger.info('💾 Creating receipt items', {
    receiptId,
    itemCount: lineItems.length,
  });

  const receiptItems = lineItems.map(item => {
    const itemName = item.name || item.catalogObjectId || 'Unknown Item';
    const itemPrice = convertCentsToDecimal(item.basePriceMoney?.amount || item.variationTotalPriceMoney?.amount || 0);
    const quantity = item.quantity || '1';
    
    return {
      receipt_id: receiptId,
      item_name: itemName,
      item_price: itemPrice,
      quantity: parseInt(quantity, 10) || 1,
    };
  });

  const { data, error } = await supabase
    .from('receipt_items')
    .insert(receiptItems)
    .select();

  if (error) {
    throw error;
  }

  logger.info('✅ Receipt items created successfully', {
    receiptId,
    itemCount: data.length,
  });

  return data;
};

/**
 * Handle Square webhook event
 * @param {Object} event - The webhook event from Square
 * @param {Object} logger - Fastify logger instance
 * @returns {Promise<Object>} Processing result
 */
export const handleSquareWebhook = async (event, logger) => {
  // Log that webhook was received
  logger.info('📥 Square webhook received', {
    type: event.type,
    eventId: event.event_id,
    merchantId: event.merchant_id,
  });

  // Only process payment.created events, ignore all others
  if (event.type === 'payment.created') {
    const paymentId = event.data?.object?.payment?.id;
    
    if (!paymentId) {
      logger.error('❌ Payment ID not found in webhook event', { event });
      return {
        processed: false,
        eventType: event.type,
        eventId: event.event_id,
        message: 'Payment ID not found in event',
        error: 'Missing payment ID',
      };
    }

    logger.info('🔄 Processing payment.created event', {
      eventId: event.event_id,
      paymentId,
    });

    try {
      // Step 1: Fetch payment details from Square
      logger.info('📡 Fetching payment details from Square', { paymentId });
      const paymentResponse = await getPaymentById(paymentId);
      const payment = paymentResponse.payment;

      if (!payment) {
        throw new Error('Payment not found in Square API response');
      }

      logger.info('✅ Payment details fetched', {
        paymentId: payment.id,
        amount: payment.amountMoney?.amount,
        currency: payment.amountMoney?.currency,
        orderId: payment.orderId,
      });

      // Step 2: Fetch order details if orderId is present
      let order = null;
      if (payment.orderId) {
        try {
          logger.info('📡 Fetching order details from Square', { orderId: payment.orderId });
          const orderResponse = await getOrderById(payment.orderId);
          order = orderResponse.order;
          logger.info('✅ Order details fetched', {
            orderId: order.id,
            lineItemCount: order.lineItems?.length || 0,
          });
        } catch (orderError) {
          logger.warn('⚠️ Failed to fetch order details, continuing without order', {
            orderId: payment.orderId,
            error: orderError.message,
          });
          // Continue without order - receipt will still be created
        }
      } else {
        logger.info('ℹ️ No order ID in payment, skipping order fetch');
      }

      // Step 3: Create receipt in Supabase
      logger.info('💾 Creating receipt in database');
      const receipt = await createReceipt(payment, logger);

      // Step 4: Create receipt items if order has line items
      let receiptItems = [];
      if (order && order.lineItems && order.lineItems.length > 0) {
        try {
          receiptItems = await createReceiptItems(receipt.id, order, logger);
        } catch (itemsError) {
          logger.error('❌ Failed to create receipt items', {
            receiptId: receipt.id,
            error: itemsError.message,
          });
          // Don't fail the whole process if items fail
        }
      }

      logger.info('🎉 Payment processed successfully', {
        receiptId: receipt.id,
        paymentId: receipt.payment_id,
        itemCount: receiptItems.length,
      });

      return {
        processed: true,
        eventType: event.type,
        eventId: event.event_id,
        receiptId: receipt.id,
        paymentId: receipt.payment_id,
        itemCount: receiptItems.length,
        message: 'Receipt created successfully',
      };
    } catch (error) {
      logger.error('❌ Failed to process payment.created event', {
        eventId: event.event_id,
        paymentId,
        error: error.message,
        stack: error.stack,
      });

      return {
        processed: false,
        eventType: event.type,
        eventId: event.event_id,
        message: 'Failed to process payment',
        error: error.message,
      };
    }
  }

  // Ignore all other event types
  logger.info('⏭️ Ignoring event type', {
    eventType: event.type,
    eventId: event.event_id,
  });

  return {
    processed: false,
    eventType: event.type,
    eventId: event.event_id,
    message: 'Event type ignored',
  };
};

/**
 * Validate webhook payload structure
 * @param {Object} payload - The webhook payload
 * @returns {boolean} True if valid
 */
export const isValidWebhookPayload = (payload) => {
  // Square webhooks can be either a single event or an array of events
  if (Array.isArray(payload)) {
    return payload.every(event => event.type && event.event_id);
  }
  
  // Single event object
  return payload && typeof payload === 'object' && payload.type && payload.event_id;
};

