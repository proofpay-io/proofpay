import { NextRequest, NextResponse } from 'next/server';
import { getSquareClient, getSquareLocationId, isSquareConfigured, generateIdempotencyKey } from '../../../../lib/square-client';
import dotenv from 'dotenv';

// Load environment variables explicitly for Next.js API routes
dotenv.config({ path: '.env.local' });

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  quantity: number;
  unit_price_cents: number;
  variation?: string; // e.g., size
}

interface CreateSaleRequest {
  items: CartItem[];
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Log request start
    console.log('🛒 [CREATE-SALE] Request received');

    // Check Square configuration
    if (!isSquareConfigured()) {
      console.error('❌ [CREATE-SALE] Square not configured');
      return NextResponse.json(
        {
          error: 'Square not configured',
          message: 'SQUARE_ACCESS_TOKEN and SQUARE_LOCATION_ID must be set in environment variables',
        },
        { status: 500 }
      );
    }

    // Parse request body
    let body: CreateSaleRequest;
    try {
      body = await request.json();
    } catch (error) {
      console.error('❌ [CREATE-SALE] Invalid JSON in request body:', error);
      return NextResponse.json(
        {
          error: 'Invalid request body',
          message: 'Request body must be valid JSON',
        },
        { status: 400 }
      );
    }

    // Validate request body
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      console.error('❌ [CREATE-SALE] Invalid items array');
      return NextResponse.json(
        {
          error: 'Invalid request',
          message: 'Items array is required and must not be empty',
        },
        { status: 400 }
      );
    }

    console.log(`📦 [CREATE-SALE] Processing ${body.items.length} items`);

    // Validate each item
    for (const item of body.items) {
      if (!item.product_id || !item.name || !item.sku || !item.quantity || !item.unit_price_cents) {
        console.error('❌ [CREATE-SALE] Invalid item:', item);
        return NextResponse.json(
          {
            error: 'Invalid item',
            message: 'Each item must have product_id, name, sku, quantity, and unit_price_cents',
          },
          { status: 400 }
        );
      }
    }

    // Get Square client and location
    const client = getSquareClient();
    const locationId = getSquareLocationId();
    
    console.log(`📍 [CREATE-SALE] Using location: ${locationId}`);
    
    // Verify client has required APIs
    const hasOrdersApi = !!client.orders;
    const hasPaymentsApi = !!client.payments;
    
    if (!hasOrdersApi) {
      console.error('❌ [CREATE-SALE] Orders API is not available');
      console.error('❌ [CREATE-SALE] Client keys:', Object.keys(client).filter(k => !k.startsWith('_')));
      throw new Error('Square orders API is not available. Check Square SDK version.');
    }
    
    if (!hasPaymentsApi) {
      console.error('❌ [CREATE-SALE] Payments API is not available');
      throw new Error('Square payments API is not available. Check Square SDK version.');
    }
    
    console.log('✅ [CREATE-SALE] Square APIs available:', {
      orders: !!client.orders,
      payments: !!client.payments,
    });

    // Calculate total
    const totalCents = body.items.reduce((sum, item) => {
      return sum + item.unit_price_cents * item.quantity;
    }, 0);

    console.log(`💰 [CREATE-SALE] Total amount: $${(totalCents / 100).toFixed(2)}`);

    // Build line items for Square Order
    const lineItems = body.items.map((item) => {
      const lineItem: any = {
        name: item.name,
        quantity: item.quantity.toString(),
        basePriceMoney: {
          amount: BigInt(item.unit_price_cents),
          currency: 'USD',
        },
        note: `SKU: ${item.sku}`,
      };

      // Add variation if provided (e.g., size)
      if (item.variation) {
        lineItem.variationName = item.variation;
      }

      return lineItem;
    });

    console.log(`📋 [CREATE-SALE] Created ${lineItems.length} line items`);

    // Generate idempotency key for order
    const orderIdempotencyKey = generateIdempotencyKey();
    console.log(`🔑 [CREATE-SALE] Order idempotency key: ${orderIdempotencyKey}`);

    // Create Square Order
    console.log('📝 [CREATE-SALE] Creating Square Order...');
    // Square SDK v40: use orders.create()
    const ordersApi = client.orders;
    if (!ordersApi) {
      throw new Error('Square orders API is not available. Check Square SDK version.');
    }
    const orderResponse = await ordersApi.create({
      idempotencyKey: orderIdempotencyKey,
      order: {
        locationId: locationId,
        lineItems: lineItems,
        state: 'OPEN',
      },
    });

    if (orderResponse.result.errors && orderResponse.result.errors.length > 0) {
      const errorMessages = orderResponse.result.errors.map((e: any) => e.detail || e.message).join(', ');
      console.error('❌ [CREATE-SALE] Order creation failed:', errorMessages);
      return NextResponse.json(
        {
          error: 'Order creation failed',
          message: errorMessages,
        },
        { status: 500 }
      );
    }

    const order = orderResponse.result.order;
    const orderId = order?.id;

    if (!orderId) {
      console.error('❌ [CREATE-SALE] Order created but no order ID returned');
      return NextResponse.json(
        {
          error: 'Order creation failed',
          message: 'Order was created but no order ID was returned',
        },
        { status: 500 }
      );
    }

    console.log(`✅ [CREATE-SALE] Order created: ${orderId}`);

    // Generate idempotency key for payment
    const paymentIdempotencyKey = generateIdempotencyKey();
    console.log(`🔑 [CREATE-SALE] Payment idempotency key: ${paymentIdempotencyKey}`);

    // Create Square Payment
    console.log('💳 [CREATE-SALE] Creating Square Payment...');
    // Square SDK v40: use payments.create()
    const paymentsApi = client.payments;
    if (!paymentsApi) {
      throw new Error('Square payments API is not available. Check Square SDK version.');
    }
    const paymentResponse = await paymentsApi.create({
      idempotencyKey: paymentIdempotencyKey,
      sourceId: 'cnon:card-nonce-ok', // Square test nonce for sandbox
      amountMoney: {
        amount: BigInt(totalCents),
        currency: 'USD',
      },
      orderId: orderId,
    });

    if (paymentResponse.result.errors && paymentResponse.result.errors.length > 0) {
      const errorMessages = paymentResponse.result.errors.map((e: any) => e.detail || e.message).join(', ');
      console.error('❌ [CREATE-SALE] Payment creation failed:', errorMessages);
      
      return NextResponse.json(
        {
          error: 'Payment creation failed',
          message: errorMessages,
          order_id: orderId, // Return order_id even if payment fails
        },
        { status: 500 }
      );
    }

    const payment = paymentResponse.result.payment;
    const paymentId = payment?.id;

    if (!paymentId) {
      console.error('❌ [CREATE-SALE] Payment created but no payment ID returned');
      return NextResponse.json(
        {
          error: 'Payment creation failed',
          message: 'Payment was created but no payment ID was returned',
          order_id: orderId,
        },
        { status: 500 }
      );
    }

    const duration = Date.now() - startTime;
    console.log(`✅ [CREATE-SALE] Payment created: ${paymentId} (took ${duration}ms)`);
    console.log(`🎉 [CREATE-SALE] Sale completed successfully`);

    // Return success response
    return NextResponse.json({
      success: true,
      order_id: orderId,
      payment_id: paymentId,
      total_cents: totalCents,
    });

  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.error(`❌ [CREATE-SALE] Error after ${duration}ms:`, error);

    // Handle Square API errors
    if (error.errors && Array.isArray(error.errors)) {
      const errorMessages = error.errors.map((e: any) => e.detail || e.message).join(', ');
      return NextResponse.json(
        {
          error: 'Square API error',
          message: errorMessages,
        },
        { status: 500 }
      );
    }

    // Handle other errors
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error.message || 'An unexpected error occurred',
      },
      { status: 500 }
    );
  }
}

