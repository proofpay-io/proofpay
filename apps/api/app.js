import Fastify from 'fastify';
import cors from '@fastify/cors';
import { supabase, testConnection } from './lib/db.js';
import { handleSquareWebhook, isValidWebhookPayload } from './lib/webhooks.js';
import { logReceiptViewed, logDisputeCreated, logReceiptViewBlocked, logReceiptEvent, logReceiptShareCreated, logReceiptShareViewed, logReceiptVerified, logReceiptVerificationFailed } from './lib/events.js';
import { createOrGetShareToken, getReceiptByToken, verifyShareToken, voidShareToken } from './lib/receipt-shares.js';
import { isQRVerificationEnabled, setQRVerificationEnabled, isQRSingleUseEnabled, setQRSingleUseEnabled, getQRTokenExpiryMinutes, setQRTokenExpiryMinutes, getAllQRSettings } from './lib/qr-settings.js';
import { isKillSwitchEnabled, isReceiptsEnabled } from './lib/kill-switch.js';
import { getConfidenceThreshold, isReceiptBelowThreshold } from './lib/confidence-threshold.js';

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

    // Receipts API endpoints
    // GET /api/receipts - List all receipts
    fastify.get('/api/receipts', async (request, reply) => {
      try {
        // Check if receipts are enabled
        const receiptsEnabled = await isReceiptsEnabled();
        if (!receiptsEnabled) {
          fastify.log.info('🚫 Receipts disabled - blocking receipt access');
          
          // Log blocked view event for list page (no specific receipt_id)
          logReceiptViewBlocked(null, {
            reason: 'FEATURE_DISABLED',
            path: request.url,
            method: request.method,
            user_agent: request.headers['user-agent'] || null,
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });
          
          return reply.code(503).send({
            error: 'Service unavailable',
            message: 'Receipts are currently unavailable',
            receipts_enabled: false
          });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

    fastify.log.info('📋 Fetching all receipts');

    // Get confidence threshold
    const threshold = await getConfidenceThreshold();
    fastify.log.info(`📊 Confidence threshold: ${threshold}`);

    // Fetch receipts with their items
    const { data: receipts, error: receiptsError } = await supabase
      .from('receipts')
      .select(`
        *,
        receipt_items (*)
      `)
      .order('created_at', { ascending: false });

    if (receiptsError) {
      fastify.log.error('❌ Error fetching receipts:', receiptsError);
      return reply.code(500).send({
        error: 'Database error',
        message: receiptsError.message
      });
    }

    // Fetch disputes for all receipts (active, resolved)
    const receiptIds = (receipts || []).map(r => r.id);
    let activeDisputesByReceipt = {};
    let resolvedDisputesByReceipt = {};
    if (receiptIds.length > 0) {
      const { data: disputes, error: disputesError } = await supabase
        .from('disputes')
        .select('receipt_id, status')
        .in('receipt_id', receiptIds);

      if (!disputesError && disputes) {
        // Create maps of receipt_id -> hasActiveDispute and hasResolvedDispute
        disputes.forEach(dispute => {
          if (dispute.status === 'submitted' || dispute.status === 'in_review') {
            activeDisputesByReceipt[dispute.receipt_id] = true;
          } else if (dispute.status === 'resolved') {
            resolvedDisputesByReceipt[dispute.receipt_id] = true;
          }
        });
      }
    }

    // Check each receipt against threshold and mark items as hidden if below threshold
    // Only mark as below threshold if confidence_score exists AND is below threshold
    // Receipts without confidence scores should still be shown (they're "unknown" confidence)
    // HIGH confidence receipts are always shown regardless of threshold
    const receiptsWithThreshold = (receipts || []).map(receipt => {
      // HIGH confidence receipts are always shown
      if (receipt.confidence_label === 'HIGH') {
        return {
          ...receipt,
          below_threshold: false,
          has_active_dispute: activeDisputesByReceipt[receipt.id] || false,
          has_resolved_dispute: resolvedDisputesByReceipt[receipt.id] || false,
          is_refunded: receipt.refunded || false,
          receipt_items: receipt.receipt_items
        };
      }
      
      // Only consider below threshold if confidence_score exists and is below threshold
      const hasConfidenceScore = receipt.confidence_score !== null && receipt.confidence_score !== undefined;
      const isBelowThreshold = hasConfidenceScore && receipt.confidence_score < threshold;
      return {
        ...receipt,
        below_threshold: isBelowThreshold,
        has_active_dispute: activeDisputesByReceipt[receipt.id] || false,
        has_resolved_dispute: resolvedDisputesByReceipt[receipt.id] || false,
        is_refunded: receipt.refunded || false,
        // Hide receipt_items if below threshold
        receipt_items: isBelowThreshold ? [] : receipt.receipt_items
      };
    });

        fastify.log.info(`✅ Found ${receiptsWithThreshold?.length || 0} receipts`);
        
        return reply.code(200).send({
          success: true,
          count: receiptsWithThreshold?.length || 0,
          receipts: receiptsWithThreshold || [],
          confidence_threshold: threshold
        });
      } catch (error) {
        fastify.log.error('❌ Error in GET /api/receipts:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // POST /api/disputes - Create a new dispute
    fastify.post('/api/disputes', async (request, reply) => {
      try {
        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        fastify.log.info('📝 Creating dispute');

        // Parse and validate request body
        const body = request.body;
        
        if (!body.receipt_id) {
          return reply.code(400).send({
            error: 'Validation error',
            message: 'receipt_id is required'
          });
        }

        if (!body.selected_items || !Array.isArray(body.selected_items) || body.selected_items.length === 0) {
          return reply.code(400).send({
            error: 'Validation error',
            message: 'selected_items is required and must contain at least one item'
          });
        }

        if (!body.reason_code) {
          return reply.code(400).send({
            error: 'Validation error',
            message: 'reason_code is required'
          });
        }

        const receiptId = body.receipt_id;
        const selectedItems = body.selected_items;
        const reasonCode = body.reason_code;
        const notes = body.notes || null;

        // Validate receipt exists
        const { data: receipt, error: receiptError } = await supabase
          .from('receipts')
          .select('id')
          .eq('id', receiptId)
          .single();

        if (receiptError || !receipt) {
          fastify.log.warn('⚠️ Receipt not found', { receiptId });
          return reply.code(404).send({
            error: 'Receipt not found',
            message: `No receipt found with ID: ${receiptId}`
          });
        }

        // Fetch receipt items to get prices and validate selected items
        const { data: receiptItems, error: itemsError } = await supabase
          .from('receipt_items')
          .select('id, item_price, quantity')
          .eq('receipt_id', receiptId);

        if (itemsError) {
          fastify.log.error('❌ Error fetching receipt items:', itemsError);
          return reply.code(500).send({
            error: 'Database error',
            message: 'Failed to fetch receipt items'
          });
        }

        // Validate selected items exist and calculate disputed total
        let disputedTotalCents = 0;
        const validSelectedItems = [];

        for (const selectedItem of selectedItems) {
          if (!selectedItem.receipt_item_id) {
            return reply.code(400).send({
              error: 'Validation error',
              message: 'Each selected item must have a receipt_item_id'
            });
          }

          const receiptItem = receiptItems.find(item => item.id === selectedItem.receipt_item_id);
          
          if (!receiptItem) {
            return reply.code(400).send({
              error: 'Validation error',
              message: `Receipt item ${selectedItem.receipt_item_id} not found in receipt`
            });
          }

          const quantity = selectedItem.quantity || receiptItem.quantity;
          if (quantity <= 0) {
            return reply.code(400).send({
              error: 'Validation error',
              message: 'Quantity must be greater than 0'
            });
          }

          // Calculate disputed amount for this item (price * quantity in cents)
          const itemPriceCents = Math.round(parseFloat(receiptItem.item_price) * 100);
          const itemDisputedCents = itemPriceCents * quantity;
          disputedTotalCents += itemDisputedCents;

          validSelectedItems.push({
            receipt_item_id: selectedItem.receipt_item_id,
            quantity: quantity,
            amount_cents: itemDisputedCents
          });
        }

        fastify.log.info('💾 Creating dispute', {
          receiptId,
          itemCount: validSelectedItems.length,
          disputedTotalCents
        });

        // Create dispute record
        // Try with total_amount_cents first, fall back without it if column doesn't exist
        let disputeData = {
          receipt_id: receiptId,
          status: 'submitted',
          reason_code: reasonCode,
          notes: notes,
          total_amount_cents: disputedTotalCents
        };

        let { data: dispute, error: disputeError } = await supabase
          .from('disputes')
          .insert(disputeData)
          .select()
          .single();

        // If error is about missing column, retry without total_amount_cents
        if (disputeError && (
          disputeError.message?.includes('total_amount_cents') ||
          disputeError.message?.includes('column') ||
          disputeError.message?.includes('schema cache')
        )) {
          fastify.log.warn('⚠️ total_amount_cents column not found, creating dispute without it. Run migration 004 to enable total amount tracking.');
          
          // Retry without total_amount_cents
          disputeData = {
            receipt_id: receiptId,
            status: 'submitted',
            reason_code: reasonCode,
            notes: notes
          };

          const retryResult = await supabase
            .from('disputes')
            .insert(disputeData)
            .select()
            .single();

          dispute = retryResult.data;
          disputeError = retryResult.error;
        }

        if (disputeError) {
          fastify.log.error('❌ Error creating dispute:', disputeError);
          return reply.code(500).send({
            error: 'Database error',
            message: `Failed to create dispute: ${disputeError.message}`
          });
        }

        const disputeId = dispute.id;
        fastify.log.info('✅ Dispute created', { disputeId });

        // Create dispute items
        const disputeItemsData = validSelectedItems.map(item => ({
          dispute_id: disputeId,
          receipt_item_id: item.receipt_item_id,
          quantity: item.quantity,
          amount_cents: item.amount_cents
        }));

        const { data: disputeItems, error: disputeItemsError } = await supabase
          .from('dispute_items')
          .insert(disputeItemsData)
          .select();

        if (disputeItemsError) {
          fastify.log.error('❌ Error creating dispute items:', disputeItemsError);
          // Don't fail the request, dispute is already created
          // But log the error
        } else {
          fastify.log.info('✅ Dispute items created', {
            disputeId,
            itemCount: disputeItems.length
          });
        }

        // Log dispute_created event (non-blocking)
        logDisputeCreated(receiptId, {
          dispute_id: disputeId,
          reason_code: reasonCode,
          item_count: validSelectedItems.length,
          disputed_total_cents: disputedTotalCents
        }, fastify.log).catch(() => {
          // Error already logged in logDisputeCreated, just catch to prevent unhandled rejection
        });

        fastify.log.info('🎉 Dispute created successfully', {
          disputeId,
          receiptId,
          status: dispute.status
        });

        return reply.code(201).send({
          success: true,
          dispute_id: disputeId,
          status: dispute.status
        });

      } catch (error) {
        fastify.log.error('❌ Error in POST /api/disputes:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/receipts/:id - Get a specific receipt by ID
    fastify.get('/api/receipts/:id', async (request, reply) => {
      try {
        // Check if receipts are enabled
        const receiptsEnabled = await isReceiptsEnabled();
        if (!receiptsEnabled) {
          const receiptId = request.params.id;
          fastify.log.info('🚫 Receipts disabled - blocking receipt access', { receiptId });
          
          // Log blocked view event with FEATURE_DISABLED reason
          logReceiptViewBlocked(receiptId, {
            reason: 'FEATURE_DISABLED',
            path: request.url,
            method: request.method,
            user_agent: request.headers['user-agent'] || null,
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });
          
          return reply.code(503).send({
            error: 'Service unavailable',
            message: 'Receipts are currently unavailable',
            receipts_enabled: false
          });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const receiptId = request.params.id;
        fastify.log.info('📋 Fetching receipt', { receiptId });

        // Fetch receipt with its items
        const { data: receipt, error: receiptError } = await supabase
          .from('receipts')
          .select(`
            *,
            receipt_items (*)
          `)
          .eq('id', receiptId)
          .single();

        if (receiptError) {
          if (receiptError.code === 'PGRST116') {
            // No rows returned
            fastify.log.warn('⚠️ Receipt not found', { receiptId });
            return reply.code(404).send({
              error: 'Receipt not found',
              message: `No receipt found with ID: ${receiptId}`
            });
          }
          
          fastify.log.error('❌ Error fetching receipt:', receiptError);
          return reply.code(500).send({
            error: 'Database error',
            message: receiptError.message
          });
        }

        fastify.log.info('✅ Receipt fetched successfully', { receiptId });
        
        // Get confidence threshold
        const threshold = await getConfidenceThreshold();
        
        // Check if receipt is below threshold
        // HIGH confidence receipts are always shown regardless of threshold
        let isBelowThreshold = false;
        if (receipt.confidence_label !== 'HIGH') {
          isBelowThreshold = await isReceiptBelowThreshold(receipt, threshold);
        }
        
        // If below threshold, log blocked view and return receipt with empty items
        if (isBelowThreshold) {
          fastify.log.info('🚫 Receipt below confidence threshold - blocking view', {
            receiptId,
            confidence_score: receipt.confidence_score,
            threshold
          });
          
          // Log blocked view event with BELOW_THRESHOLD reason
          logReceiptViewBlocked(receiptId, {
            reason: 'BELOW_THRESHOLD',
            confidence_score: receipt.confidence_score,
            confidence_label: receipt.confidence_label,
            threshold: threshold,
            path: request.url,
            method: request.method,
            user_agent: request.headers['user-agent'] || null,
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });
          
          return reply.code(200).send({
            success: true,
            receipt: {
              ...receipt,
              below_threshold: true,
              receipt_items: [] // Hide items for below-threshold receipts
            }
          });
        }
        
        // Log receipt_viewed event (non-blocking - errors won't break the response)
        logReceiptViewed(receiptId, {
          path: request.url,
          method: request.method,
          user_agent: request.headers['user-agent'] || null,
        }, fastify.log).catch(() => {
          // Error already logged in logReceiptViewed, just catch to prevent unhandled rejection
        });
        
        return reply.code(200).send({
          success: true,
          receipt: {
            ...receipt,
            below_threshold: false
          }
        });
      } catch (error) {
        fastify.log.error('❌ Error in GET /api/receipts/:id:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // POST /api/receipts/:id/share - Create or get share token for a receipt
    fastify.post('/api/receipts/:id/share', async (request, reply) => {
      try {
        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const receiptId = request.params.id;
        fastify.log.info('🔗 Creating/getting share token', { receiptId });

        // Validate receipt exists
        const { data: receipt, error: receiptError } = await supabase
          .from('receipts')
          .select('id')
          .eq('id', receiptId)
          .single();

        if (receiptError || !receipt) {
          fastify.log.warn('⚠️ Receipt not found', { receiptId });
          return reply.code(404).send({
            error: 'Receipt not found',
            message: `No receipt found with ID: ${receiptId}`
          });
        }

        // Create or get share token
        // Pass null for logger to use safe console logging (prevents Pino errors)
        const share = await createOrGetShareToken(receiptId, {
          expiresAt: null, // No expiry for demo
          logger: null // Use safe console logging instead of fastify.log
        });

        // Log share created event
        logReceiptShareCreated(receiptId, {
          share_id: share.id,
          token: share.token.substring(0, 4) + '...', // Only log partial token
        }, fastify.log).catch(() => {
          // Error already logged, just catch to prevent unhandled rejection
        });

        fastify.log.info('✅ Share token created/retrieved', { receiptId, shareId: share.id });

        return reply.code(200).send({
          success: true,
          share: {
            id: share.id,
            token: share.token,
            verify_url: share.verifyUrl,
            created_at: share.created_at,
            expires_at: share.expires_at,
          }
        });
      } catch (error) {
        fastify.log.error('❌ Error in POST /api/receipts/:id/share:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/verify/:token - Get receipt by share token (public endpoint)
    fastify.get('/api/verify/:token', async (request, reply) => {
      try {
        // CRITICAL: Log immediately to confirm this code path is executing
        fastify.log.info('🔍 [VERIFY-ENDPOINT] VERIFY ENDPOINT CALLED - NEW CODE VERSION');
        
        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const token = request.params.token;
        fastify.log.info('🔍 Verifying share token', { token: token.substring(0, 4) + '...' });
        fastify.log.info('🔍 [VERIFY-ENDPOINT] Token received: ' + token.substring(0, 4) + '...');

        // Get receipt by token
        // Pass null for logger to use safe console logging (prevents Pino errors)
        const result = await getReceiptByToken(token, {
          logger: null // Use safe console logging instead of fastify.log
        });

        // Handle invalid states
        if (!result || result.verification_state === 'INVALID') {
          fastify.log.warn('⚠️ Invalid share token', { token: token.substring(0, 4) + '...' });
          
          // Log verification failure
          const receiptId = result?.receipt?.id || null;
          logReceiptVerificationFailed(receiptId, {
            verification_state: 'INVALID',
            token_id: result?.share?.id || null,
            token_preview: token.substring(0, 4) + '...',
            reason: result ? 'Token invalid or revoked' : 'Token not found'
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });

          return reply.code(404).send({
            success: false,
            verification_state: 'INVALID',
            error: 'Invalid token',
            message: 'This verification link is invalid or has been revoked'
          });
        }

        // Handle expired state
        if (result.verification_state === 'EXPIRED') {
          fastify.log.warn('⚠️ Expired share token', { token: token.substring(0, 4) + '...' });
          
          // Log verification failure
          const receiptId = result?.receipt?.id || null;
          logReceiptVerificationFailed(receiptId, {
            verification_state: 'EXPIRED',
            token_id: result?.share?.id || null,
            token_preview: token.substring(0, 4) + '...',
            reason: 'Token expired'
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });

          return reply.code(404).send({
            success: false,
            verification_state: 'EXPIRED',
            error: 'Expired token',
            message: 'This verification link has expired'
          });
        }

        const { verification_state, receipt, share } = result;

        // CRITICAL: Fetch receipt_items DIRECTLY from database with explicit column selection
        // Don't rely on getReceiptByToken - fetch fresh to ensure item_name is always included
        fastify.log.info('🔍 [VERIFY] Fetching receipt_items directly from DB', {
          receipt_id: receipt.id,
        });

        const { data: dbItems, error: itemsError } = await supabase
          .from('receipt_items')
          .select('id, receipt_id, item_name, item_price, quantity, created_at, updated_at, description, sku, variation, category')
          .eq('receipt_id', receipt.id)
          .order('created_at', { ascending: true });

        let receiptItems = [];
        if (itemsError) {
          fastify.log.error('❌ [VERIFY] Error fetching receipt_items:', itemsError);
          receiptItems = [];
        } else {
          receiptItems = dbItems || [];
          fastify.log.info('✅ [VERIFY] Fetched receipt_items from DB', {
            receipt_id: receipt.id,
            item_count: receiptItems.length,
            first_item_keys: receiptItems[0] ? Object.keys(receiptItems[0]).join(', ') : 'none',
            first_item_has_item_name: receiptItems[0]?.item_name ? true : false,
            first_item_name: receiptItems[0]?.item_name || 'MISSING',
            first_item_full: receiptItems[0] ? JSON.stringify(receiptItems[0]) : 'none',
          });

          // Log ALL items to see which ones are missing item_name
          receiptItems.forEach((item, idx) => {
            if (!item.item_name) {
              fastify.log.error(`❌ [VERIFY] Item ${idx} missing item_name from DB:`, {
                item_id: item.id,
                item_keys: Object.keys(item),
                item_json: JSON.stringify(item),
              });
            }
          });
        }

        // Fetch dispute details if receipt is disputed
        let disputeInfo = null;
        if (verification_state === 'DISPUTED') {
          const { data: disputes, error: disputesError } = await supabase
            .from('disputes')
            .select('id, status, reason_code, notes, created_at, total_amount_cents')
            .eq('receipt_id', receipt.id)
            .in('status', ['submitted', 'in_review'])
            .order('created_at', { ascending: false })
            .limit(1);

          if (!disputesError && disputes && disputes.length > 0) {
            const dispute = disputes[0];
            
            // Fetch disputed items
            const { data: disputeItems, error: disputeItemsError } = await supabase
              .from('dispute_items')
              .select(`
                id,
                quantity,
                amount_cents,
                receipt_items:receipt_item_id (
                  id,
                  item_name,
                  item_price
                )
              `)
              .eq('dispute_id', dispute.id);

            if (!disputeItemsError && disputeItems) {
              disputeInfo = {
                dispute_id: dispute.id,
                status: dispute.status,
                reason_code: dispute.reason_code,
                notes: dispute.notes,
                created_at: dispute.created_at,
                total_amount_cents: dispute.total_amount_cents,
                disputed_items: disputeItems.map(di => ({
                  item_name: di.receipt_items?.item_name || null,
                  item_price: di.receipt_items?.item_price || null,
                  quantity: di.quantity,
                  amount_cents: di.amount_cents
                }))
              };
            } else {
              // Fallback if dispute items can't be fetched
              disputeInfo = {
                dispute_id: dispute.id,
                status: dispute.status,
                reason_code: dispute.reason_code,
                notes: dispute.notes,
                created_at: dispute.created_at,
                total_amount_cents: dispute.total_amount_cents,
                disputed_items: []
              };
            }
          }
        }

        // Log verification attempt (success or failure based on state)
        if (verification_state === 'VALID') {
          logReceiptVerified(receipt.id, {
            verification_state: 'VALID',
            token_id: share.id,
            token_preview: token.substring(0, 4) + '...',
            view_count: share.view_count,
            single_use: share.single_use || false,
            used_at: share.used_at || null
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });
        } else {
          // Log verification failure for other states (REFUNDED, DISPUTED)
          logReceiptVerificationFailed(receipt.id, {
            verification_state: verification_state,
            token_id: share.id,
            token_preview: token.substring(0, 4) + '...',
            reason: verification_state === 'REFUNDED' ? 'Receipt refunded' : 
                    verification_state === 'DISPUTED' ? 'Receipt under dispute' : 'Unknown'
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });
        }

        // Also log share viewed event for tracking
        logReceiptShareViewed(receipt.id, {
          token: token.substring(0, 4) + '...', // Only log partial token
          view_count: share.view_count,
        }, fastify.log).catch(() => {
          // Error already logged, just catch to prevent unhandled rejection
        });

        // CRITICAL: Ensure receipt_items have item_name before sending response
        // Map items to explicitly guarantee item_name is present
        // Use receiptItems from first mapping (which should have item_name from getReceiptByToken)
        const finalReceiptItems = (receiptItems || []).map((item, idx) => {
          // Log what we're mapping
          fastify.log.info(`🔍 [VERIFY] Final mapping item ${idx}:`, {
            item_keys: Object.keys(item),
            has_item_name: 'item_name' in item,
            item_name_value: item.item_name,
            item_full: JSON.stringify(item),
          });
          // Log if item_name is missing
          if (!item.item_name) {
            fastify.log.error('❌ [VERIFY] Item missing item_name in final mapping:', {
              item_id: item.id,
              item_keys: Object.keys(item),
              item_json: JSON.stringify(item),
            });
          }
          
          // Return item with explicit item_name field
          return {
            id: item.id,
            receipt_id: item.receipt_id,
            item_name: item.item_name || 'Item Name Missing', // FORCE item_name to be present
            item_price: String(item.item_price || '0'),
            quantity: item.quantity || 1,
            created_at: item.created_at,
            updated_at: item.updated_at,
            description: item.description || null,
            sku: item.sku || null,
            variation: item.variation || null,
            category: item.category || null,
          };
        });

        // Log finalReceiptItems to verify item_name is present
        fastify.log.info('🔍 [VERIFY] Final receipt_items before response', {
          item_count: finalReceiptItems.length,
          first_item_keys: finalReceiptItems[0] ? Object.keys(finalReceiptItems[0]).join(', ') : 'none',
          first_item_has_item_name: finalReceiptItems[0]?.item_name ? true : false,
          first_item_name: finalReceiptItems[0]?.item_name || 'MISSING',
          first_item_full: finalReceiptItems[0] ? JSON.stringify(finalReceiptItems[0]) : 'none',
        });

        // Return read-only receipt data (includes Payment ID and Receipt ID for verification)
        // CRITICAL: Don't use spread operator on receipt - it might overwrite receipt_items
        // Build receipt object explicitly to ensure receipt_items is included
        const response = {
          success: true,
          verification_state: verification_state,
          receipt: {
            id: receipt.id,
            payment_id: receipt.payment_id,
            amount: receipt.amount,
            currency: receipt.currency,
            created_at: receipt.created_at,
            updated_at: receipt.updated_at,
            merchant_name: receipt.merchant_name,
            source: receipt.source,
            purchase_time: receipt.purchase_time,
            confidence_score: receipt.confidence_score,
            confidence_label: receipt.confidence_label,
            confidence_reasons: receipt.confidence_reasons,
            refunded: receipt.refunded,
            refunded_at: receipt.refunded_at,
            refund_amount: receipt.refund_amount,
            // CRITICAL: Explicitly include receipt_items with item_name
            receipt_items: finalReceiptItems,
          },
          share: {
            view_count: share.view_count,
            created_at: share.created_at,
            status: share.status || 'active',
            verified_at: share.verified_at,
            verification_attempts: share.verification_attempts || 0,
          },
          dispute: disputeInfo
        };

        // CRITICAL: Log BEFORE sending response
        fastify.log.info('🔍 [VERIFY] FINAL CHECK - About to send response', {
          receiptId: receipt.id,
          viewCount: share.view_count,
          finalReceiptItems_count: finalReceiptItems.length,
          finalReceiptItems_first_item_keys: finalReceiptItems[0] ? Object.keys(finalReceiptItems[0]).join(', ') : 'none',
          finalReceiptItems_first_item_name: finalReceiptItems[0]?.item_name || 'MISSING',
          response_receipt_items_count: response.receipt.receipt_items.length,
          response_first_item_keys: response.receipt.receipt_items[0] ? Object.keys(response.receipt.receipt_items[0]).join(', ') : 'none',
          response_first_item_name: response.receipt.receipt_items[0]?.item_name || 'MISSING',
        });

        fastify.log.info('✅ Receipt retrieved by token', { 
          receiptId: receipt.id,
          viewCount: share.view_count,
          itemCount: finalReceiptItems.length,
          first_item_has_name: finalReceiptItems[0]?.item_name ? true : false,
        });

        // Set cache-control headers to prevent caching
        reply.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
        
        return reply.code(200).send(response);
      } catch (error) {
        fastify.log.error('❌ Error in GET /api/verify/:token:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/merchant/verify/:token - Merchant verification endpoint (read-only check)
    fastify.get('/api/merchant/verify/:token', async (request, reply) => {
      try {
        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const token = request.params.token;
        const merchantId = request.query.merchant_id || null; // Optional merchant identifier
        
        fastify.log.info('🔍 Merchant verifying token', { token: token.substring(0, 4) + '...', merchantId });

        // Verify token (read-only, doesn't mark as used)
        const result = await verifyShareToken(token, {
          merchantId: merchantId,
          markAsUsed: false,
          logger: fastify.log
        });

        if (!result.valid) {
          fastify.log.warn('⚠️ Merchant verification failed', { 
            token: token.substring(0, 4) + '...',
            reason: result.reason 
          });
          return reply.code(404).send({
            success: false,
            valid: false,
            reason: result.reason,
            status: result.status,
          });
        }

        fastify.log.info('✅ Merchant verification successful', { 
          token: token.substring(0, 4) + '...',
          status: result.status 
        });

        return reply.code(200).send({
          success: true,
          valid: true,
          status: result.status,
          receipt: result.receipt,
          share: result.share,
        });
      } catch (error) {
        fastify.log.error('❌ Error in GET /api/merchant/verify/:token:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // POST /api/merchant/verify/:token - Merchant verification with action (mark as used)
    fastify.post('/api/merchant/verify/:token', async (request, reply) => {
      try {
        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const token = request.params.token;
        const body = request.body || {};
        const merchantId = body.merchant_id || request.query.merchant_id || null;
        const markAsUsed = body.mark_as_used === true || body.mark_as_used === 'true';
        
        fastify.log.info('🔍 Merchant verifying token (with action)', { 
          token: token.substring(0, 4) + '...', 
          merchantId,
          markAsUsed 
        });

        // Verify token (may mark as used)
        const result = await verifyShareToken(token, {
          merchantId: merchantId,
          markAsUsed: markAsUsed,
          logger: fastify.log
        });

        if (!result.valid) {
          fastify.log.warn('⚠️ Merchant verification failed', { 
            token: token.substring(0, 4) + '...',
            reason: result.reason,
            verification_state: result.verification_state
          });
          return reply.code(404).send({
            success: false,
            valid: false,
            verification_state: result.verification_state || 'INVALID',
            reason: result.reason,
            status: result.status,
          });
        }

        fastify.log.info('✅ Merchant verification successful', { 
          token: token.substring(0, 4) + '...',
          verification_state: result.verification_state,
          status: result.status,
          markAsUsed 
        });

        return reply.code(200).send({
          success: true,
          valid: true,
          verification_state: result.verification_state,
          status: result.status,
          receipt: result.receipt,
          share: result.share,
          message: markAsUsed ? 'Token marked as used' : 'Token verified',
        });
      } catch (error) {
        fastify.log.error('❌ Error in POST /api/merchant/verify/:token:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // Bank Admin API endpoints
    // Simple authentication check (prototype - will be replaced with proper auth)
    const checkBankAdminAuth = (request) => {
      const authSecret = process.env.BANK_ADMIN_SECRET || 'dev-secret-change-in-production';
      const querySecret = request.query.secret;
      const headerSecret = request.headers['x-bank-admin-secret'];
      
      // Allow if secret matches or if no secret is set (dev mode)
      if (!authSecret || authSecret === 'dev-secret-change-in-production') {
        return true; // Dev mode - no auth required
      }
      
      return querySecret === authSecret || headerSecret === authSecret;
    };

    // GET /api/bank-admin/dashboard - Dashboard metrics
    fastify.get('/api/bank-admin/dashboard', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        fastify.log.info('📊 Fetching dashboard metrics');

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Get receipt counts from receipt_events table (same approach as views)
    // This is more reliable than querying receipts table directly
    const { count: receipts7d, error: receipts7dError } = await supabase
      .from('receipt_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'receipt_created')
      .gte('created_at', sevenDaysAgo.toISOString());

    const { count: receipts30d, error: receipts30dError } = await supabase
      .from('receipt_events')
      .select('*', { count: 'exact', head: true })
      .eq('event_type', 'receipt_created')
      .gte('created_at', thirtyDaysAgo.toISOString());

    if (receipts7dError) {
      fastify.log.error('❌ Error fetching receipts7d:', receipts7dError);
    }
    if (receipts30dError) {
      fastify.log.error('❌ Error fetching receipts30d:', receipts30dError);
    }

    fastify.log.info(`📊 Receipt counts from events: receipts7d=${receipts7d || 0}, receipts30d=${receipts30d || 0}`);

        // Get view counts from receipt_events
        const { count: views7d } = await supabase
          .from('receipt_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'receipt_viewed')
          .gte('created_at', sevenDaysAgo.toISOString());

        const { count: views30d } = await supabase
          .from('receipt_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'receipt_viewed')
          .gte('created_at', thirtyDaysAgo.toISOString());

        // Get dispute counts
        const { count: disputes7d } = await supabase
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', sevenDaysAgo.toISOString());

        const { count: disputes30d } = await supabase
          .from('disputes')
          .select('*', { count: 'exact', head: true })
          .gte('created_at', thirtyDaysAgo.toISOString());

        // Get receipts by confidence label
        const { data: allReceiptsForConfidence } = await supabase
          .from('receipts')
          .select('confidence_label');

        const confidenceCounts = {
          HIGH: 0,
          MEDIUM: 0,
          LOW: 0,
          NULL: 0 // Receipts without confidence_label
        };

        if (allReceiptsForConfidence) {
          allReceiptsForConfidence.forEach(receipt => {
            const label = receipt.confidence_label;
            if (label === 'HIGH') {
              confidenceCounts.HIGH++;
            } else if (label === 'MEDIUM') {
              confidenceCounts.MEDIUM++;
            } else if (label === 'LOW') {
              confidenceCounts.LOW++;
            } else {
              confidenceCounts.NULL++;
            }
          });
        }

        // Get blocked views count (total and last 7 days)
        const { count: blockedViewsTotal } = await supabase
          .from('receipt_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'receipt_view_blocked');

        const { count: blockedViews7d } = await supabase
          .from('receipt_events')
          .select('*', { count: 'exact', head: true })
          .eq('event_type', 'receipt_view_blocked')
          .gte('created_at', sevenDaysAgo.toISOString());

        // Get blocked views with reasons breakdown
        const { data: allBlockedViews } = await supabase
          .from('receipt_events')
          .select('metadata')
          .eq('event_type', 'receipt_view_blocked');

        const blockedViewReasons = {
          FEATURE_DISABLED: 0,
          BELOW_THRESHOLD: 0,
          UNKNOWN: 0
        };

        if (allBlockedViews) {
          allBlockedViews.forEach(event => {
            const reason = event.metadata?.reason;
            if (reason === 'FEATURE_DISABLED') {
              blockedViewReasons.FEATURE_DISABLED++;
            } else if (reason === 'BELOW_THRESHOLD') {
              blockedViewReasons.BELOW_THRESHOLD++;
            } else {
              blockedViewReasons.UNKNOWN++;
            }
          });
        }

        // Get blocked views trend for last 7 days
        const { data: allBlockedViews7d } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_view_blocked')
          .gte('created_at', sevenDaysAgo.toISOString());

        // Group blocked views by day for last 7 days
        const blockedViewsTrendMap = new Map();
        for (let i = 6; i >= 0; i--) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          date.setHours(0, 0, 0, 0);
          const dateKey = date.toISOString().split('T')[0];
          blockedViewsTrendMap.set(dateKey, {
            date: date.toISOString(),
            blocked_views: 0
          });
        }

        if (allBlockedViews7d) {
          allBlockedViews7d.forEach(event => {
            const date = new Date(event.created_at);
            date.setHours(0, 0, 0, 0);
            const dateKey = date.toISOString().split('T')[0];
            const dayData = blockedViewsTrendMap.get(dateKey);
            if (dayData) {
              dayData.blocked_views++;
            }
          });
        }

        const blockedViewsTrend = Array.from(blockedViewsTrendMap.values()).sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        // Get daily metrics for last 30 days - optimized: fetch all data and group in JavaScript
        // This reduces from 90 queries (30 days × 3 queries) to just 3 queries
        const thirtyDaysAgoStart = new Date(thirtyDaysAgo);
        thirtyDaysAgoStart.setUTCHours(0, 0, 0, 0); // Use UTC for consistency

        // Fetch all receipt_created events from last 30 days (same approach as views)
        // This is more reliable than querying receipts table directly
        const { data: allReceipts, error: receiptsError } = await supabase
          .from('receipt_events')
          .select('created_at, event_type, receipt_id')
          .eq('event_type', 'receipt_created')
          .gte('created_at', thirtyDaysAgoStart.toISOString())
          .order('created_at', { ascending: false });

        if (receiptsError) {
          fastify.log.error('❌ Error fetching receipt_created events for daily metrics:', receiptsError);
          fastify.log.error('❌ Error details:', JSON.stringify(receiptsError, null, 2));
        } else {
          fastify.log.info(`📊 Fetched ${allReceipts?.length || 0} receipt_created events for daily metrics`);
          if (allReceipts && allReceipts.length > 0) {
            fastify.log.info(`📅 Sample receipt event dates: ${allReceipts.slice(0, 5).map(e => e.created_at).join(', ')}`);
            fastify.log.info(`📅 Sample receipt event structure: ${JSON.stringify(allReceipts[0], null, 2)}`);
          } else {
            fastify.log.warn('⚠️ No receipt_created events found in the last 30 days');
            // Try to fetch all receipt_created events to see if any exist
            const { data: allReceiptsEver, error: allError } = await supabase
              .from('receipt_events')
              .select('created_at, event_type')
              .eq('event_type', 'receipt_created')
              .limit(5);
            if (!allError && allReceiptsEver && allReceiptsEver.length > 0) {
              fastify.log.info(`📊 Found ${allReceiptsEver.length} receipt_created events total (outside 30-day window)`);
              fastify.log.info(`📅 Oldest event: ${allReceiptsEver[allReceiptsEver.length - 1].created_at}`);
              fastify.log.info(`📅 Newest event: ${allReceiptsEver[0].created_at}`);
            } else if (allError) {
              fastify.log.error('❌ Error checking for any receipt_created events:', allError);
            } else {
              fastify.log.warn('⚠️ No receipt_created events exist in the database at all');
            }
          }
        }

        // Fetch all receipt_viewed events from last 30 days
        const { data: allViews, error: viewsError } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_viewed')
          .gte('created_at', thirtyDaysAgoStart.toISOString());

        // Fetch all disputes from last 30 days
        const { data: allDisputes, error: disputesError } = await supabase
          .from('disputes')
          .select('created_at')
          .gte('created_at', thirtyDaysAgoStart.toISOString());

        // Group by day in JavaScript
        const dailyMetricsMap = new Map();
        
        // Initialize all 30 days with zeros
        // Use UTC dates to ensure consistent date keys
        const nowUTC = new Date(now.toISOString());
        for (let i = 29; i >= 0; i--) {
          const date = new Date(nowUTC.getTime() - i * 24 * 60 * 60 * 1000);
          // Set to UTC midnight to ensure consistent date keys
          const year = date.getUTCFullYear();
          const month = String(date.getUTCMonth() + 1).padStart(2, '0');
          const day = String(date.getUTCDate()).padStart(2, '0');
          const dateKey = `${year}-${month}-${day}`; // YYYY-MM-DD in UTC
          
          // Create ISO string for the date at UTC midnight
          const dateISO = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0)).toISOString();
          
          dailyMetricsMap.set(dateKey, {
            date: dateISO,
            receipts: 0,
            views: 0,
            disputes: 0
          });
        }
        
        fastify.log.info(`📅 Initialized ${dailyMetricsMap.size} days in dailyMetricsMap`);
        fastify.log.info(`📅 Sample date keys: ${Array.from(dailyMetricsMap.keys()).slice(0, 5).join(', ')}`);

        // Count receipt_created events by day
        if (allReceipts && allReceipts.length > 0) {
          fastify.log.info(`📊 Processing ${allReceipts.length} receipt_created events for daily metrics`);
          fastify.log.info(`📅 Date range keys in map: ${Array.from(dailyMetricsMap.keys()).slice(0, 5).join(', ')}...`);
          
          allReceipts.forEach((event, idx) => {
            if (!event.created_at) {
              fastify.log.warn(`⚠️ Event ${idx} has no created_at field`);
              return;
            }
            
            const date = new Date(event.created_at);
            if (isNaN(date.getTime())) {
              fastify.log.warn(`⚠️ Event ${idx} has invalid date: ${event.created_at}`);
              return;
            }
            
            // Extract UTC date components to create consistent date key
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`; // YYYY-MM-DD in UTC
            
            const dayData = dailyMetricsMap.get(dateKey);
            
            if (dayData) {
              dayData.receipts++;
              if (idx < 5) { // Log first 5 for debugging
                fastify.log.info(`✅ Counted receipt ${idx + 1}: eventDate=${event.created_at}, dateKey=${dateKey}, total for day=${dayData.receipts}`);
              }
            } else {
              fastify.log.warn(`⚠️ No dayData found for dateKey: ${dateKey} (event date: ${event.created_at})`);
              // Try to find closest date key
              const allKeys = Array.from(dailyMetricsMap.keys());
              fastify.log.warn(`   Available date keys: ${allKeys.slice(0, 10).join(', ')}...`);
            }
          });
        } else {
          fastify.log.warn(`⚠️ No receipt_created events found for daily metrics (allReceipts=${allReceipts ? 'array' : 'null'}, length=${allReceipts?.length || 0})`);
        }

        // Count views by day (using UTC date keys for consistency)
        if (allViews) {
          allViews.forEach(view => {
            const date = new Date(view.created_at);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;
            const dayData = dailyMetricsMap.get(dateKey);
            if (dayData) {
              dayData.views++;
            }
          });
        }

        // Count disputes by day (using UTC date keys for consistency)
        if (allDisputes) {
          allDisputes.forEach(dispute => {
            const date = new Date(dispute.created_at);
            const year = date.getUTCFullYear();
            const month = String(date.getUTCMonth() + 1).padStart(2, '0');
            const day = String(date.getUTCDate()).padStart(2, '0');
            const dateKey = `${year}-${month}-${day}`;
            const dayData = dailyMetricsMap.get(dateKey);
            if (dayData) {
              dayData.disputes++;
            }
          });
        }

        // Convert map to array, sorted by date
        const dailyMetrics = Array.from(dailyMetricsMap.values()).sort((a, b) => 
          new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        const totalReceipts = dailyMetrics.reduce((sum, day) => sum + (day.receipts || 0), 0);
        const totalViews = dailyMetrics.reduce((sum, day) => sum + (day.views || 0), 0);
        const totalDisputes = dailyMetrics.reduce((sum, day) => sum + (day.disputes || 0), 0);
        
        fastify.log.info(`📊 Daily metrics summary: ${dailyMetrics.length} days`);
        fastify.log.info(`📊 Totals - Receipts: ${totalReceipts}, Views: ${totalViews}, Disputes: ${totalDisputes}`);
        
        // Log a sample of daily metrics to verify structure
        if (dailyMetrics.length > 0) {
          const sampleDays = dailyMetrics.filter(d => (d.receipts || 0) > 0 || (d.views || 0) > 0 || (d.disputes || 0) > 0).slice(0, 5);
          if (sampleDays.length > 0) {
            fastify.log.info(`📊 Sample daily metrics with data: ${JSON.stringify(sampleDays, null, 2)}`);
          } else {
            fastify.log.warn('⚠️ No daily metrics with data found');
          }
          
          // Log all days to see the structure
          fastify.log.info(`📊 First 3 days structure: ${JSON.stringify(dailyMetrics.slice(0, 3), null, 2)}`);
        }

        // Ensure all daily metrics have the correct structure
        const validatedDailyMetrics = dailyMetrics.map(day => ({
          date: day.date,
          receipts: day.receipts || 0,
          views: day.views || 0,
          disputes: day.disputes || 0
        }));

        return reply.code(200).send({
          receipts_7d: receipts7d || 0,
          receipts_30d: receipts30d || 0,
          views_7d: views7d || 0,
          views_30d: views30d || 0,
          disputes_7d: disputes7d || 0,
          disputes_30d: disputes30d || 0,
          daily_metrics: dailyMetrics,
          confidence_counts: {
            HIGH: confidenceCounts.HIGH,
            MEDIUM: confidenceCounts.MEDIUM,
            LOW: confidenceCounts.LOW,
            NULL: confidenceCounts.NULL
          },
          blocked_views_total: blockedViewsTotal || 0,
          blocked_views_7d: blockedViews7d || 0,
          blocked_views_trend: blockedViewsTrend,
          blocked_view_reasons: blockedViewReasons
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/dashboard:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/bank-admin/usage - Event log with pagination and filters
    fastify.get('/api/bank-admin/usage', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const page = parseInt(request.query.page) || 1;
        const pageSize = parseInt(request.query.page_size) || 50;
        const offset = (page - 1) * pageSize;

        let query = supabase
          .from('receipt_events')
          .select('*', { count: 'exact' });

        // Apply filters
        if (request.query.event_type) {
          query = query.eq('event_type', request.query.event_type);
        }
        if (request.query.start_date) {
          query = query.gte('created_at', request.query.start_date);
        }
        if (request.query.end_date) {
          query = query.lte('created_at', request.query.end_date + 'T23:59:59.999Z');
        }

        // Apply pagination and ordering
        query = query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        const { data: events, error: eventsError, count } = await query;

        if (eventsError) {
          fastify.log.error('❌ Error fetching events:', eventsError);
          return reply.code(500).send({
            error: 'Database error',
            message: eventsError.message
          });
        }

        return reply.code(200).send({
          success: true,
          events: events || [],
          total: count || 0,
          page: page,
          page_size: pageSize
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/usage:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/bank-admin/disputes - List disputes with pagination
    fastify.get('/api/bank-admin/disputes', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const page = parseInt(request.query.page) || 1;
        const pageSize = parseInt(request.query.page_size) || 50;
        const offset = (page - 1) * pageSize;

        let query = supabase
          .from('disputes')
          .select('*', { count: 'exact' });

        // Apply pagination and ordering
        query = query
          .order('created_at', { ascending: false })
          .range(offset, offset + pageSize - 1);

        const { data: disputes, error: disputesError, count } = await query;

        if (disputesError) {
          fastify.log.error('❌ Error fetching disputes:', disputesError);
          return reply.code(500).send({
            error: 'Database error',
            message: disputesError.message
          });
        }

        // Get item counts for each dispute
        const disputesWithCounts = await Promise.all(
          (disputes || []).map(async (dispute) => {
            const { count: itemCount } = await supabase
              .from('dispute_items')
              .select('*', { count: 'exact', head: true })
              .eq('dispute_id', dispute.id);

            return {
              ...dispute,
              item_count: itemCount || 0
            };
          })
        );

        return reply.code(200).send({
          success: true,
          disputes: disputesWithCounts,
          total: count || 0,
          page: page,
          page_size: pageSize
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/disputes:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/bank-admin/disputes/:id - Get dispute detail
    fastify.get('/api/bank-admin/disputes/:id', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const disputeId = request.params.id;

        // Get dispute
        const { data: dispute, error: disputeError } = await supabase
          .from('disputes')
          .select('*')
          .eq('id', disputeId)
          .single();

        if (disputeError || !dispute) {
          return reply.code(404).send({
            error: 'Dispute not found',
            message: `No dispute found with ID: ${disputeId}`
          });
        }

        // Get dispute items
        const { data: items, error: itemsError } = await supabase
          .from('dispute_items')
          .select('*')
          .eq('dispute_id', disputeId);

        if (itemsError) {
          fastify.log.error('❌ Error fetching dispute items:', itemsError);
        }

        // Get receipt info with confidence fields
        const { data: receipt, error: receiptError } = await supabase
          .from('receipts')
          .select('id, merchant_name, amount, currency, confidence_score, confidence_label, confidence_reasons')
          .eq('id', dispute.receipt_id)
          .single();

        if (receiptError) {
          fastify.log.error('❌ Error fetching receipt:', receiptError);
        }

        return reply.code(200).send({
          dispute: dispute,
          items: items || [],
          receipt: receipt || { id: dispute.receipt_id, amount: '0', currency: 'USD' }
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/disputes/:id:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/bank-admin/kill-switch - Get kill switch status
    fastify.get('/api/bank-admin/kill-switch', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        // Try to get from database
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .select('value')
          .eq('key', 'kill_switch')
          .single();

        if (settingError || !setting) {
          // Fallback to environment variable
          const envKillSwitch = process.env.KILL_SWITCH_ENABLED === 'true';
          return reply.code(200).send({
            enabled: envKillSwitch
          });
        }

        return reply.code(200).send({
          enabled: setting.value?.enabled || false
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/kill-switch:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/admin/metrics/daily.csv - Daily aggregated metrics as CSV
    fastify.get('/api/admin/metrics/daily.csv', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        fastify.log.info('📊 Fetching daily metrics for CSV export');

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Initialize daily metrics structure for last 30 days
        const dailyMetrics = {};
        for (let i = 0; i < 30; i++) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
          dailyMetrics[dateKey] = {
            date: dateKey,
            receipts_created: 0,
            receipts_viewed: 0,
            receipt_view_blocked: 0,
            disputes_created: 0,
            avg_confidence_score: null,
            confidence_counts: {
              HIGH: 0,
              MEDIUM: 0,
              LOW: 0
            }
          };
        }

        // 1. Get receipt_created events (from receipt_events table)
        const { data: receiptCreatedEvents } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_created')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receiptCreatedEvents) {
          receiptCreatedEvents.forEach(event => {
            const dateKey = new Date(event.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].receipts_created++;
            }
          });
        }

        // 2. Get receipt_viewed events
        const { data: receiptViewedEvents } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_viewed')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receiptViewedEvents) {
          receiptViewedEvents.forEach(event => {
            const dateKey = new Date(event.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].receipts_viewed++;
            }
          });
        }

        // 3. Get receipt_view_blocked events
        const { data: receiptBlockedEvents } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_view_blocked')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receiptBlockedEvents) {
          receiptBlockedEvents.forEach(event => {
            const dateKey = new Date(event.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].receipt_view_blocked++;
            }
          });
        }

        // 4. Get disputes_created (from disputes table)
        const { data: disputes } = await supabase
          .from('disputes')
          .select('created_at')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (disputes) {
          disputes.forEach(dispute => {
            const dateKey = new Date(dispute.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].disputes_created++;
            }
          });
        }

        // 5. Get receipts with confidence scores for avg and counts
        const { data: receipts } = await supabase
          .from('receipts')
          .select('created_at, confidence_score, confidence_label')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receipts) {
          // Group by date for calculations
          const receiptsByDate = {};
          receipts.forEach(receipt => {
            const dateKey = new Date(receipt.created_at).toISOString().split('T')[0];
            if (!receiptsByDate[dateKey]) {
              receiptsByDate[dateKey] = {
                scores: [],
                labels: { HIGH: 0, MEDIUM: 0, LOW: 0 }
              };
            }
            if (receipt.confidence_score !== null && receipt.confidence_score !== undefined) {
              receiptsByDate[dateKey].scores.push(receipt.confidence_score);
            }
            if (receipt.confidence_label) {
              const label = receipt.confidence_label.toUpperCase();
              if (receiptsByDate[dateKey].labels[label] !== undefined) {
                receiptsByDate[dateKey].labels[label]++;
              }
            }
          });

          // Calculate averages and update daily metrics
          Object.keys(receiptsByDate).forEach(dateKey => {
            if (dailyMetrics[dateKey]) {
              const dateData = receiptsByDate[dateKey];
              if (dateData.scores.length > 0) {
                const sum = dateData.scores.reduce((a, b) => a + b, 0);
                dailyMetrics[dateKey].avg_confidence_score = Math.round((sum / dateData.scores.length) * 10) / 10; // Round to 1 decimal
              }
              dailyMetrics[dateKey].confidence_counts = dateData.labels;
            }
          });
        }

        // Convert to array sorted by date (most recent first)
        const metricsArray = Object.values(dailyMetrics)
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        // Generate CSV
        const csvHeaders = [
          'date',
          'receipts_created',
          'receipts_viewed',
          'views_blocked',
          'disputes_created',
          'avg_confidence',
          'high_confidence',
          'medium_confidence',
          'low_confidence'
        ];

        const csvRows = [csvHeaders.join(',')];

        metricsArray.forEach(metric => {
          const row = [
            metric.date, // ISO format (YYYY-MM-DD)
            metric.receipts_created,
            metric.receipts_viewed,
            metric.receipt_view_blocked,
            metric.disputes_created,
            metric.avg_confidence_score !== null ? metric.avg_confidence_score.toFixed(1) : '',
            metric.confidence_counts.HIGH,
            metric.confidence_counts.MEDIUM,
            metric.confidence_counts.LOW
          ];
          csvRows.push(row.join(','));
        });

        const csvContent = csvRows.join('\n');

        // Generate filename with current date
        const filenameDate = now.toISOString().split('T')[0];
        const filename = `proofpay-usage-report-${filenameDate}.csv`;

        // Set headers for CSV download
        reply.header('Content-Type', 'text/csv');
        reply.header('Content-Disposition', `attachment; filename="${filename}"`);

        return reply.code(200).send(csvContent);

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/admin/metrics/daily.csv:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/admin/metrics/daily - Daily aggregated metrics for last 30 days
    fastify.get('/api/admin/metrics/daily', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        fastify.log.info('📊 Fetching daily metrics for last 30 days');

        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

        // Initialize daily metrics structure for last 30 days
        const dailyMetrics = {};
        for (let i = 0; i < 30; i++) {
          const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
          const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD
          dailyMetrics[dateKey] = {
            date: dateKey,
            receipts_created: 0,
            receipts_viewed: 0,
            receipt_view_blocked: 0,
            disputes_created: 0,
            avg_confidence_score: null,
            confidence_counts: {
              HIGH: 0,
              MEDIUM: 0,
              LOW: 0
            }
          };
        }

        // 1. Get receipt_created events (from receipt_events table)
        const { data: receiptCreatedEvents } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_created')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receiptCreatedEvents) {
          receiptCreatedEvents.forEach(event => {
            const dateKey = new Date(event.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].receipts_created++;
            }
          });
        }

        // 2. Get receipt_viewed events
        const { data: receiptViewedEvents } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_viewed')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receiptViewedEvents) {
          receiptViewedEvents.forEach(event => {
            const dateKey = new Date(event.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].receipts_viewed++;
            }
          });
        }

        // 3. Get receipt_view_blocked events
        const { data: receiptBlockedEvents } = await supabase
          .from('receipt_events')
          .select('created_at')
          .eq('event_type', 'receipt_view_blocked')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receiptBlockedEvents) {
          receiptBlockedEvents.forEach(event => {
            const dateKey = new Date(event.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].receipt_view_blocked++;
            }
          });
        }

        // 4. Get disputes_created (from disputes table)
        const { data: disputes } = await supabase
          .from('disputes')
          .select('created_at')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (disputes) {
          disputes.forEach(dispute => {
            const dateKey = new Date(dispute.created_at).toISOString().split('T')[0];
            if (dailyMetrics[dateKey]) {
              dailyMetrics[dateKey].disputes_created++;
            }
          });
        }

        // 5. Get receipts with confidence scores for avg and counts
        const { data: receipts } = await supabase
          .from('receipts')
          .select('created_at, confidence_score, confidence_label')
          .gte('created_at', thirtyDaysAgo.toISOString());

        if (receipts) {
          // Group by date for calculations
          const receiptsByDate = {};
          receipts.forEach(receipt => {
            const dateKey = new Date(receipt.created_at).toISOString().split('T')[0];
            if (!receiptsByDate[dateKey]) {
              receiptsByDate[dateKey] = {
                scores: [],
                labels: { HIGH: 0, MEDIUM: 0, LOW: 0 }
              };
            }
            if (receipt.confidence_score !== null && receipt.confidence_score !== undefined) {
              receiptsByDate[dateKey].scores.push(receipt.confidence_score);
            }
            if (receipt.confidence_label) {
              const label = receipt.confidence_label.toUpperCase();
              if (receiptsByDate[dateKey].labels[label] !== undefined) {
                receiptsByDate[dateKey].labels[label]++;
              }
            }
          });

          // Calculate averages and update daily metrics
          Object.keys(receiptsByDate).forEach(dateKey => {
            if (dailyMetrics[dateKey]) {
              const dateData = receiptsByDate[dateKey];
              if (dateData.scores.length > 0) {
                const sum = dateData.scores.reduce((a, b) => a + b, 0);
                dailyMetrics[dateKey].avg_confidence_score = Math.round((sum / dateData.scores.length) * 100) / 100; // Round to 2 decimals
              }
              dailyMetrics[dateKey].confidence_counts = dateData.labels;
            }
          });
        }

        // Convert to array sorted by date (most recent first)
        const metricsArray = Object.values(dailyMetrics)
          .sort((a, b) => new Date(b.date) - new Date(a.date));

        return reply.code(200).send({
          success: true,
          period: {
            start: thirtyDaysAgo.toISOString().split('T')[0],
            end: now.toISOString().split('T')[0],
            days: 30
          },
          metrics: metricsArray
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/admin/metrics/daily:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/demo/status - Get latest receipt and dispute IDs for demo
    fastify.get('/api/demo/status', async (request, reply) => {
      try {
        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        // Get latest receipt
        const { data: latestReceipt, error: receiptError } = await supabase
          .from('receipts')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        // Get latest dispute
        const { data: latestDispute, error: disputeError } = await supabase
          .from('disputes')
          .select('id')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        return reply.code(200).send({
          success: true,
          latest_receipt_id: latestReceipt?.id || null,
          latest_dispute_id: latestDispute?.id || null
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/demo/status:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/bank-admin/receipts-enabled - Get receipts enabled status
    fastify.get('/api/bank-admin/receipts-enabled', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        // Try to get from database
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .select('value')
          .eq('key', 'receipts_enabled')
          .single();

        if (settingError || !setting) {
          // Fallback to default (enabled)
          return reply.code(200).send({
            enabled: true
          });
        }

        return reply.code(200).send({
          enabled: setting.value?.enabled !== false // Default to true if not set
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/receipts-enabled:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // PUT /api/bank-admin/receipts-enabled - Update receipts enabled status
    fastify.put('/api/bank-admin/receipts-enabled', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const { enabled } = request.body;

        if (typeof enabled !== 'boolean') {
          return reply.code(400).send({
            error: 'Validation error',
            message: 'enabled must be a boolean'
          });
        }

        // Update or insert receipts_enabled setting
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .upsert({
            key: 'receipts_enabled',
            value: { enabled: enabled },
            description: 'Master toggle to enable/disable receipt viewing. When disabled, all receipts are hidden from customers regardless of confidence threshold.'
          }, {
            onConflict: 'key'
          })
          .select()
          .single();

        if (settingError) {
          fastify.log.error('❌ Error updating receipts_enabled:', settingError);
          return reply.code(500).send({
            error: 'Database error',
            message: settingError.message
          });
        }

        return reply.code(200).send({
          enabled: setting.value?.enabled !== false
        });

      } catch (error) {
        fastify.log.error('❌ Error in PUT /api/bank-admin/receipts-enabled:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/bank-admin/retention-policy - Get retention policy
    fastify.get('/api/bank-admin/retention-policy', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        // Try to get from database
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .select('value')
          .eq('key', 'receipt_retention_days')
          .single();

        if (settingError || !setting) {
          // Fallback to default (90 days)
          return reply.code(200).send({
            days: 90
          });
        }

        return reply.code(200).send({
          days: setting.value?.days || 90 // Default to 90 if not set
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/retention-policy:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // PUT /api/bank-admin/retention-policy - Update retention policy
    fastify.put('/api/bank-admin/retention-policy', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const { days } = request.body;

        if (typeof days !== 'number' || days < 1 || days > 3650) {
          return reply.code(400).send({
            error: 'Validation error',
            message: 'days must be a number between 1 and 3650'
          });
        }

        // Get current value for logging
        const { data: currentSetting } = await supabase
          .from('bank_settings')
          .select('value')
          .eq('key', 'receipt_retention_days')
          .single();

        const oldValue = currentSetting?.value?.days || 90;

        // Update or insert retention policy setting
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .upsert({
            key: 'receipt_retention_days',
            value: { days: days },
            description: 'Number of days to retain receipt data. Receipts older than this period may be archived or deleted according to bank policy.'
          }, {
            onConflict: 'key'
          })
          .select()
          .single();

        if (settingError) {
          fastify.log.error('❌ Error updating retention policy:', settingError);
          return reply.code(500).send({
            error: 'Database error',
            message: settingError.message
          });
        }

        // Log policy update event
        if (oldValue !== days) {
          logReceiptEvent('policy_updated', null, {
            policy_type: 'receipt_retention_days',
            old_value: oldValue,
            new_value: days,
            changed_by: request.headers['user-agent'] || 'unknown'
          }, fastify.log).catch(() => {
            // Error already logged, just catch to prevent unhandled rejection
          });
        }

        return reply.code(200).send({
          days: setting.value?.days || 90
        });

      } catch (error) {
        fastify.log.error('❌ Error in PUT /api/bank-admin/retention-policy:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // GET /api/bank-admin/confidence-threshold - Get confidence threshold
    fastify.get('/api/bank-admin/confidence-threshold', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        // Try to get from database
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .select('value')
          .eq('key', 'confidence_threshold')
          .single();

        if (settingError || !setting) {
          // Fallback to default
          return reply.code(200).send({
            threshold: 85
          });
        }

        return reply.code(200).send({
          threshold: setting.value?.threshold || 85
        });

      } catch (error) {
        fastify.log.error('❌ Error in GET /api/bank-admin/confidence-threshold:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // PUT /api/bank-admin/confidence-threshold - Update confidence threshold
    fastify.put('/api/bank-admin/confidence-threshold', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const { threshold } = request.body;

        if (typeof threshold !== 'number' || threshold < 0 || threshold > 100) {
          return reply.code(400).send({
            error: 'Validation error',
            message: 'threshold must be a number between 0 and 100'
          });
        }

        // Update or insert confidence threshold setting
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .upsert({
            key: 'confidence_threshold',
            value: { threshold: threshold },
            description: 'Minimum confidence score (0-100) required for receipts to be shown to customers. Receipts below this threshold are hidden.'
          }, {
            onConflict: 'key'
          })
          .select()
          .single();

        if (settingError) {
          fastify.log.error('❌ Error updating confidence threshold:', settingError);
          return reply.code(500).send({
            error: 'Database error',
            message: settingError.message
          });
        }

        return reply.code(200).send({
          threshold: setting.value?.threshold || threshold
        });

      } catch (error) {
        fastify.log.error('❌ Error in PUT /api/bank-admin/confidence-threshold:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // PUT /api/bank-admin/kill-switch - Update kill switch
    fastify.put('/api/bank-admin/kill-switch', async (request, reply) => {
      try {
        if (!checkBankAdminAuth(request)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }

        if (!supabase) {
          return reply.code(503).send({
            error: 'Database not configured',
            message: 'Supabase connection is not available'
          });
        }

        const { enabled } = request.body;

        if (typeof enabled !== 'boolean') {
          return reply.code(400).send({
            error: 'Validation error',
            message: 'enabled must be a boolean'
          });
        }

        // Update or insert kill switch setting
        const { data: setting, error: settingError } = await supabase
          .from('bank_settings')
          .upsert({
            key: 'kill_switch',
            value: { enabled: enabled },
            description: 'Master kill switch to disable all ProofPay functionality'
          }, {
            onConflict: 'key'
          })
          .select()
          .single();

        if (settingError) {
          fastify.log.error('❌ Error updating kill switch:', settingError);
          return reply.code(500).send({
            error: 'Database error',
            message: settingError.message
          });
        }

        return reply.code(200).send({
          enabled: setting.value?.enabled || false
        });

      } catch (error) {
        fastify.log.error('❌ Error in PUT /api/bank-admin/kill-switch:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: error.message
        });
      }
    });

    // Square webhook route - GET handler (for testing/verification)
    fastify.get('/v1/webhooks/square', async (request, reply) => {
      return reply.code(200).send({
        message: 'Square webhook endpoint is active',
        method: 'This endpoint accepts POST requests only',
        webhookUrl: 'http://localhost:4000/v1/webhooks/square',
        instructions: 'Square will send POST requests to this URL when payment events occur',
        status: 'ready'
      });
    });

    // Square webhook route - POST handler (actual webhook processing)
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

