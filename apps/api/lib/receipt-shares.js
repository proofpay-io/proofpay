/**
 * Receipt Shares Helper
 * Manages shareable verification tokens for receipts
 */

import { supabase, isConfigured } from './db.js';
import crypto from 'crypto';
import { safeLogInfo, safeLogWarn, safeLogError } from './receipt-shares-helper.js';

/**
 * Generate a secure random token
 * @param {number} length - Length of token (default: 16)
 * @returns {string} Random token string
 */
export function generateShareToken(length = 16) {
  // Generate cryptographically secure random bytes
  const bytes = crypto.randomBytes(length);
  // Convert to base64url (URL-safe base64)
  return bytes.toString('base64url').substring(0, length);
}

/**
 * Create or get an existing share token for a receipt
 * @param {string} receiptId - UUID of the receipt
 * @param {Object} options - Options (expiresAt, singleUse, logger)
 * @returns {Promise<Object>} Share token object with token and verify URL
 */
export async function createOrGetShareToken(receiptId, options = {}) {
  const { expiresAt = null, singleUse = null, logger = null } = options;

  if (!isConfigured() || !supabase) {
    safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Supabase not configured');
    throw new Error('Database not configured');
  }

  try {
    // Check if a non-expired share already exists
    const { data: existingShare, error: findError } = await supabase
      .from('receipt_shares')
      .select('*')
      .eq('receipt_id', receiptId)
      .is('expires_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(); // Use maybeSingle() instead of single() to handle no results gracefully

    if (existingShare && !findError) {
      // Return existing share
      safeLogInfo(logger, '✅ [RECEIPT-SHARE] Using existing share token', { receiptId, token: existingShare.token });
      
      return {
        id: existingShare.id,
        token: existingShare.token,
        verifyUrl: getVerifyUrl(existingShare.token),
        created_at: existingShare.created_at,
        expires_at: existingShare.expires_at,
      };
    }

    // Create new share token
    let token;
    let attempts = 0;
    const maxAttempts = 5;

    // Generate unique token (retry if collision)
    while (attempts < maxAttempts) {
      token = generateShareToken(16);
      
      // Check if token already exists
      const { data: existingToken } = await supabase
        .from('receipt_shares')
        .select('token')
        .eq('token', token)
        .single();

      if (!existingToken) {
        break; // Token is unique
      }

      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique token after multiple attempts');
      }
    }

    // Determine single_use value (use provided value, or fetch from settings if null)
    let singleUseValue = singleUse;
    if (singleUseValue === null) {
      // Import dynamically to avoid circular dependencies
      try {
        const { isQRSingleUseEnabled } = await import('./qr-settings.js');
        singleUseValue = await isQRSingleUseEnabled();
      } catch (e) {
        // If qr-settings not available, default to false
        singleUseValue = false;
      }
    }

    // Insert new share
    const { data: newShare, error: insertError } = await supabase
      .from('receipt_shares')
      .insert({
        receipt_id: receiptId,
        token: token,
        expires_at: expiresAt,
        view_count: 0,
        status: 'active', // Set default status (required by migration 014)
        single_use: singleUseValue, // Use setting or provided value
      })
      .select()
      .single();

    if (insertError) {
      safeLogError(logger, '❌ [RECEIPT-SHARE] Error creating share token:', insertError);
      
      // Check if it's a "table doesn't exist" error
      if (insertError.code === '42P01' || insertError.message?.includes('does not exist') || insertError.message?.includes('relation')) {
        throw new Error('Database table receipt_shares does not exist. Please run migration 012_add_receipt_shares.sql in Supabase.');
      }
      
      // Check if it's a "column doesn't exist" error (status column)
      if (insertError.code === '42703' || (insertError.message?.includes('column') && insertError.message?.includes('status'))) {
        throw new Error('Database table receipt_shares is missing the status column. Please run migration 014_add_verification_status.sql in Supabase.');
      }
      
      throw new Error(`Failed to create share token: ${insertError.message}`);
    }

    safeLogInfo(logger, '✅ [RECEIPT-SHARE] Created new share token', { receiptId, token: newShare.token });

    return {
      id: newShare.id,
      token: newShare.token,
      verifyUrl: getVerifyUrl(newShare.token),
      created_at: newShare.created_at,
      expires_at: newShare.expires_at,
    };

  } catch (error) {
    safeLogError(logger, '❌ [RECEIPT-SHARE] Error in createOrGetShareToken:', error);
    throw error;
  }
}

/**
 * Determine verification state for a receipt
 * States: VALID, REFUNDED, DISPUTED, EXPIRED, INVALID
 * @param {Object} share - Share token record
 * @param {Object} receipt - Receipt record
 * @param {Array} activeDisputes - Array of active disputes for the receipt
 * @returns {string} Verification state
 */
export function determineVerificationState(share, receipt, activeDisputes = []) {
  // Check if token is expired
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return 'EXPIRED';
  }

  // Check if token is voided or invalid
  if (share.status === 'voided' || !share) {
    return 'INVALID';
  }

  // Check if single-use token has already been used
  if (share.single_use === true && share.used_at) {
    return 'INVALID';
  }

  // Check if receipt exists
  if (!receipt) {
    return 'INVALID';
  }

  // For simulated receipts, check demo flags first (demo takes precedence)
  if (receipt.source === 'simulated') {
    // Check demo_expired_qr flag (simulates expired QR token)
    if (receipt.demo_expired_qr === true) {
      return 'EXPIRED';
    }
    
    // Check demo_refunded flag (simulates refunded receipt)
    if (receipt.demo_refunded === true) {
      return 'REFUNDED';
    }
    
    // Check demo_disputed flag (simulates disputed receipt)
    if (receipt.demo_disputed === true) {
      return 'DISPUTED';
    }
    
    // Default for simulated receipts: VALID (unless real flags are set)
  }

  // Check if receipt is refunded (real refund, not demo)
  if (receipt.refunded === true) {
    return 'REFUNDED';
  }

  // Check if receipt has active disputes (submitted or in_review)
  const hasActiveDispute = activeDisputes.some(dispute => 
    dispute.status === 'submitted' || dispute.status === 'in_review'
  );
  if (hasActiveDispute) {
    return 'DISPUTED';
  }

  // All checks passed - receipt is valid
  return 'VALID';
}

/**
 * Get receipt by share token with verification state
 * @param {string} token - Share token
 * @param {Object} options - Options (logger)
 * @returns {Promise<Object>} Receipt data with items and verification state
 */
export async function getReceiptByToken(token, options = {}) {
  const { logger = null } = options;

  if (!isConfigured() || !supabase) {
    safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Supabase not configured');
    throw new Error('Database not configured');
  }

  try {
    // Find share by token
    const { data: share, error: shareError } = await supabase
      .from('receipt_shares')
      .select('*')
      .eq('token', token)
      .single();

    if (shareError || !share) {
      safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Share token not found:', { token });
      return {
        verification_state: 'INVALID',
        reason: 'Token not found',
      };
    }

    // Fetch receipt with items
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', share.receipt_id)
      .single();

    if (receiptError || !receipt) {
      safeLogError(logger, '❌ [RECEIPT-SHARE] Receipt not found:', { receipt_id: share.receipt_id });
      return {
        verification_state: 'INVALID',
        reason: 'Receipt not found',
      };
    }

    // Check for active disputes (submitted or in_review)
    const { data: disputes, error: disputesError } = await supabase
      .from('disputes')
      .select('id, status')
      .eq('receipt_id', receipt.id)
      .in('status', ['submitted', 'in_review']);

    if (disputesError) {
      safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Error fetching disputes:', disputesError);
    }

    // Determine verification state
    const verificationState = determineVerificationState(share, receipt, disputes || []);

    // If expired, mark as expired in database
    if (verificationState === 'EXPIRED' && share.status !== 'expired') {
      await supabase
        .from('receipt_shares')
        .update({ status: 'expired' })
        .eq('id', share.id);
    }

    // Mark single-use token as used if it's valid and single-use
    const updateData = {
      view_count: share.view_count + 1,
      verification_attempts: (share.verification_attempts || 0) + 1
    };

    // If single-use token and verification is valid, mark as used
    if (share.single_use === true && verificationState === 'VALID' && !share.used_at) {
      updateData.used_at = new Date().toISOString();
    }

    // Increment view count and verification attempts (even for invalid states for tracking)
    await supabase
      .from('receipt_shares')
      .update(updateData)
      .eq('id', share.id);

    // Fetch receipt items
    const { data: items, error: itemsError } = await supabase
      .from('receipt_items')
      .select('*')
      .eq('receipt_id', receipt.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Error fetching items:', itemsError);
    }

    safeLogInfo(logger, '✅ [RECEIPT-SHARE] Receipt retrieved by token', { 
      token, 
      receiptId: receipt.id,
      viewCount: share.view_count + 1 
    });

    return {
      verification_state: verificationState,
      receipt: {
        ...receipt,
        receipt_items: items || [],
      },
      share: {
        view_count: share.view_count + 1,
        created_at: share.created_at,
        status: share.status || 'active',
        verified_at: share.verified_at,
        verified_by: share.verified_by,
        verification_attempts: (share.verification_attempts || 0) + 1,
      },
    };

  } catch (error) {
    safeLogError(logger, '❌ [RECEIPT-SHARE] Error in getReceiptByToken:', error);
    throw error;
  }
}

/**
 * Get verification URL for a token
 * @param {string} token - Share token
 * @returns {string} Full verification URL
 */
export function getVerifyUrl(token) {
  // Determine base URL based on environment
  // Priority: WEB_APP_URL env var > localhost (for development)
  // WEB_APP_URL must be set in production to point to the web app URL
  const baseUrl = process.env.WEB_APP_URL || 'http://localhost:3000';
  
  return `${baseUrl}/verify/${token}`;
}

/**
 * Verify a receipt share token (merchant verification)
 * @param {string} token - Share token
 * @param {Object} options - Options (merchantId, markAsUsed, logger)
 * @returns {Promise<Object>} Verification result with receipt data
 */
export async function verifyShareToken(token, options = {}) {
  const { merchantId = null, markAsUsed = false, logger = null } = options;

  if (!isConfigured() || !supabase) {
    safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Supabase not configured');
    throw new Error('Database not configured');
  }

  try {
    // Find share by token
    const { data: share, error: shareError } = await supabase
      .from('receipt_shares')
      .select('*')
      .eq('token', token)
      .single();

    if (shareError || !share) {
      safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Share token not found:', { token });
      return {
        valid: false,
        reason: 'Token not found',
      };
    }

    // Check if expired
    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      if (share.status !== 'expired') {
        await supabase
          .from('receipt_shares')
          .update({ status: 'expired' })
          .eq('id', share.id);
      }
      return {
        valid: false,
        reason: 'Token expired',
        status: 'expired',
      };
    }

    // Check if voided
    if (share.status === 'voided') {
      return {
        valid: false,
        reason: 'Token voided',
        status: 'voided',
      };
    }

    // Check if already used (if markAsUsed is true)
    if (markAsUsed && share.status === 'used') {
      return {
        valid: false,
        reason: 'Token already used',
        status: 'used',
      };
    }

    // Fetch receipt
    const { data: receipt, error: receiptError } = await supabase
      .from('receipts')
      .select('*')
      .eq('id', share.receipt_id)
      .single();

    if (receiptError || !receipt) {
      safeLogError(logger, '❌ [RECEIPT-SHARE] Receipt not found:', { receipt_id: share.receipt_id });
      return {
        valid: false,
        reason: 'Receipt not found',
      };
    }

    // Fetch receipt items
    const { data: items, error: itemsError } = await supabase
      .from('receipt_items')
      .select('*')
      .eq('receipt_id', receipt.id)
      .order('created_at', { ascending: true });

    if (itemsError) {
      safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Error fetching items:', itemsError);
    }

    // Check for active disputes
    const { data: disputes, error: disputesError } = await supabase
      .from('disputes')
      .select('id, status')
      .eq('receipt_id', receipt.id)
      .in('status', ['submitted', 'in_review']);

    if (disputesError) {
      safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Error fetching disputes:', disputesError);
    }

    // Determine verification state
    const verificationState = determineVerificationState(share, receipt, disputes || []);

    // If not VALID, return early
    if (verificationState !== 'VALID') {
      return {
        valid: false,
        verification_state: verificationState,
        reason: verificationState === 'EXPIRED' ? 'Token expired' :
                verificationState === 'REFUNDED' ? 'Receipt has been refunded' :
                verificationState === 'DISPUTED' ? 'Receipt is under dispute' :
                'Token invalid',
      };
    }

    // Update verification status
    const updateData = {
      verification_attempts: (share.verification_attempts || 0) + 1,
    };

    // If marking as verified
    if (share.status === 'active') {
      updateData.status = 'verified';
      updateData.verified_at = new Date().toISOString();
      if (merchantId) {
        updateData.verified_by = merchantId;
      }
    }

    // If marking as used
    if (markAsUsed) {
      updateData.status = 'used';
      if (!updateData.verified_at) {
        updateData.verified_at = new Date().toISOString();
      }
      if (merchantId && !updateData.verified_by) {
        updateData.verified_by = merchantId;
      }
    }

    await supabase
      .from('receipt_shares')
      .update(updateData)
      .eq('id', share.id);

    safeLogInfo(logger, '✅ [RECEIPT-SHARE] Token verified', { 
      token: token.substring(0, 4) + '...',
      receiptId: receipt.id,
      status: updateData.status,
      merchantId,
    });

    return {
      valid: true,
      verification_state: verificationState,
      status: updateData.status || share.status,
      receipt: {
        merchant_name: receipt.merchant_name,
        amount: receipt.amount,
        currency: receipt.currency,
        created_at: receipt.created_at,
        purchase_time: receipt.purchase_time,
        receipt_items: items?.map(item => ({
          name: item.name,
          quantity: item.quantity,
          item_price: item.item_price,
          total_price: item.total_price,
        })) || [],
        confidence_score: receipt.confidence_score,
        confidence_label: receipt.confidence_label,
        confidence_reasons: receipt.confidence_reasons,
        source: receipt.source,
      },
      share: {
        created_at: share.created_at,
        verified_at: updateData.verified_at || share.verified_at,
        verified_by: updateData.verified_by || share.verified_by,
        view_count: share.view_count,
        verification_attempts: updateData.verification_attempts,
      },
    };

  } catch (error) {
    safeLogError(logger, '❌ [RECEIPT-SHARE] Error in verifyShareToken:', error);
    throw error;
  }
}

/**
 * Void a receipt share token (invalidate it)
 * @param {string} token - Share token
 * @param {Object} options - Options (reason, logger)
 * @returns {Promise<boolean>} Success status
 */
export async function voidShareToken(token, options = {}) {
  const { reason = null, logger = null } = options;

  if (!isConfigured() || !supabase) {
    safeLogWarn(logger, '⚠️ [RECEIPT-SHARE] Supabase not configured');
    throw new Error('Database not configured');
  }

  try {
    const { error } = await supabase
      .from('receipt_shares')
      .update({ 
        status: 'voided',
      })
      .eq('token', token);

    if (error) {
      safeLogError(logger, '❌ [RECEIPT-SHARE] Error voiding token:', error);
      return false;
    }

    safeLogInfo(logger, '✅ [RECEIPT-SHARE] Token voided', { 
      token: token.substring(0, 4) + '...',
      reason,
    });

    return true;
  } catch (error) {
    safeLogError(logger, '❌ [RECEIPT-SHARE] Error in voidShareToken:', error);
    throw error;
  }
}

