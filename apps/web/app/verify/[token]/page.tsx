'use client';

// Force dynamic rendering - no static generation or caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import ConfidenceBadge from '../../../components/ConfidenceBadge';
import ConfidenceExplainability from '../../../components/ConfidenceExplainability';

interface ReceiptItem {
  name?: string;
  item_name?: string; // Fallback if name is not present
  quantity: number;
  item_price: string;
  total_price?: string;
  description?: string | null;
  sku?: string | null;
  variation?: string | null;
  category?: string | null;
}

interface ReceiptData {
  id?: string;
  payment_id?: string;
  merchant_name: string;
  amount: string;
  currency: string;
  created_at: string;
  purchase_time: string | null;
  receipt_items: ReceiptItem[];
  confidence_score: number | null;
  confidence_label: string | null;
  confidence_reasons: string[] | null;
  source: string;
}

interface DisputeInfo {
  dispute_id: string;
  status: string;
  reason_code: string;
  notes?: string | null;
  created_at: string;
  total_amount_cents?: number | null;
  disputed_items: Array<{
    item_name: string;
    item_price: string;
    quantity: number;
    amount_cents?: number | null;
  }>;
}

interface VerifyResponse {
  success: boolean;
  verification_state?: string; // VALID, REFUNDED, DISPUTED, EXPIRED, INVALID
  receipt?: ReceiptData;
  share?: {
    view_count: number;
    created_at: string;
    status?: string;
    verified_at?: string | null;
    verification_attempts?: number;
  };
  dispute?: DisputeInfo | null;
  error?: string;
  message?: string;
}

export default function VerifyReceipt() {
  const params = useParams();
  const token = params?.token as string;
  const [data, setData] = useState<VerifyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchReceipt = async () => {
      try {
        setLoading(true);
        setError(null);

        const apiUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost'
          ? 'http://localhost:4000'
          : 'https://aussieadrenaline-api.vercel.app';

        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
          // Force no caching - always fetch fresh data from API
          const response = await fetch(`${apiUrl}/api/verify/${token}`, {
            signal: controller.signal,
            cache: 'no-store', // Disable all caching
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache',
            },
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            let errorMessage = 'Failed to verify receipt';
            try {
              const errorData = await response.json();
              errorMessage = errorData.message || errorData.error || errorMessage;
            } catch (e) {
              // If response is not JSON, use status text
              errorMessage = response.statusText || `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
          }

          const receiptData: VerifyResponse = await response.json();
          setData(receiptData);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            throw new Error('Request timeout - the server took too long to respond');
          }
          throw fetchError;
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load receipt';
        setError(errorMessage);
        console.error('Error fetching receipt:', err);
        setData(null); // Ensure data is null on error
      } finally {
        setLoading(false);
      }
    };

    fetchReceipt();
  }, [token]);

  const formatCurrency = (amount: string, currency: string = 'USD') => {
    const numAmount = parseFloat(amount);
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(numAmount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading receipt...</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Verification Failed</h1>
          <p className="text-gray-600 mb-6">
            {error || 'This verification link is invalid or has expired.'}
          </p>
        </div>
      </main>
    );
  }

  const { receipt, share, verification_state, dispute } = data;

  if (!receipt) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Receipt Not Found</h2>
          <p className="text-gray-600">Receipt data is not available.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* ProofPay Branding Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">PP</span>
            </div>
            <h2 className="text-xl font-bold text-indigo-600">ProofPay</h2>
          </div>
          <p className="text-xs text-gray-500">Turns Payments Into Proofs Of Purchase</p>
        </div>

        {/* Prominent Status Banner */}
        {verification_state && (
          <div className={`mb-6 rounded-lg p-4 ${
            verification_state === 'VALID' 
              ? 'bg-green-50 border-2 border-green-200' 
              : verification_state === 'REFUNDED' || verification_state === 'DISPUTED'
              ? 'bg-amber-50 border-2 border-amber-200'
              : 'bg-red-50 border-2 border-red-200'
          }`}>
            <div className="flex items-center gap-3">
              {verification_state === 'VALID' && (
                <>
                  <svg className="w-6 h-6 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h2 className="text-lg font-bold text-green-900">Verified purchase</h2>
                    <p className="text-sm text-green-700 mt-1">This receipt reference reflects the current purchase status.</p>
                  </div>
                </>
              )}
              {verification_state === 'REFUNDED' && (
                <>
                  <svg className="w-6 h-6 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <div>
                    <h2 className="text-lg font-bold text-amber-900">Purchase refunded</h2>
                    <p className="text-sm text-amber-700 mt-1">This purchase has been refunded.</p>
                  </div>
                </>
              )}
              {verification_state === 'DISPUTED' && (
                <>
                  <svg className="w-6 h-6 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <h2 className="text-lg font-bold text-amber-900">Purchase disputed</h2>
                    <p className="text-sm text-amber-700 mt-1">This purchase is currently under dispute.</p>
                    {dispute && (
                      <div className="mt-3 pt-3 border-t border-amber-200">
                        {dispute.reason_code && (
                          <p className="text-xs text-amber-800 font-medium mb-1">
                            Reason: {dispute.reason_code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                          </p>
                        )}
                        {dispute.notes && (
                          <p className="text-xs text-amber-700 mt-1">{dispute.notes}</p>
                        )}
                        {dispute.disputed_items && Array.isArray(dispute.disputed_items) && dispute.disputed_items.length > 0 && (
                          <div className="mt-2">
                            <p className="text-xs text-amber-800 font-medium mb-1">Disputed Items:</p>
                            <ul className="text-xs text-amber-700 space-y-1">
                              {dispute.disputed_items.map((item, idx) => (
                                <li key={idx}>
                                  • {item.quantity || 0}x {item.item_name || 'Unknown item'}
                                  {item.amount_cents && (
                                    <span className="ml-2">
                                      ({formatCurrency((item.amount_cents / 100).toString(), receipt.currency || 'USD')})
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {dispute.total_amount_cents && (
                          <p className="text-xs text-amber-800 font-semibold mt-2">
                            Disputed Amount: {formatCurrency((dispute.total_amount_cents / 100).toString(), receipt.currency || 'USD')}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
              {(verification_state === 'EXPIRED' || verification_state === 'INVALID') && (
                <>
                  <svg className="w-6 h-6 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  <div>
                    <h2 className="text-lg font-bold text-red-900">Not a valid proof of purchase</h2>
                    <p className="text-sm text-red-700 mt-1">
                      {verification_state === 'EXPIRED' 
                        ? 'This verification link has expired.' 
                        : 'This verification link is invalid or has been revoked.'}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Digital Receipt</h1>
            <p className="text-sm text-gray-600">Proof of Purchase Reference</p>
          </div>

          {/* Receipt Info - Always Show */}
          <div className="border-t border-gray-200 pt-6">
            {/* Merchant Name */}
            <div className="mb-4">
              <h2 className="text-xl font-bold text-gray-900">
                {receipt.merchant_name || 'Merchant'}
              </h2>
              {receipt.source === 'simulated' && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded mt-1 inline-block">
                  🎭 Simulated
                </span>
              )}
            </div>

            {/* Purchase Date & Time */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Purchase Date & Time:</span>
              </p>
              <p className="text-base text-gray-900 font-medium">
                {formatDate(receipt.purchase_time || receipt.created_at)}
              </p>
            </div>

            {/* Total Amount */}
            <div className="mb-4">
              <p className="text-sm text-gray-600">
                <span className="font-medium">Total Amount:</span>
              </p>
              <p className="text-3xl font-bold text-indigo-600">
                {formatCurrency(receipt.amount, receipt.currency)}
              </p>
              <p className="text-sm text-gray-500 mt-1">{receipt.currency}</p>
            </div>

            {/* Total Quantity */}
            {receipt.receipt_items && receipt.receipt_items.length > 0 && (
              <div className="mb-4">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Total Quantity:</span>
                </p>
                <p className="text-base text-gray-900 font-medium">
                  {receipt.receipt_items.reduce((sum, item) => sum + (item.quantity || 0), 0)} item{receipt.receipt_items.reduce((sum, item) => sum + (item.quantity || 0), 0) !== 1 ? 's' : ''}
                </p>
              </div>
            )}

            {/* Payment ID and Receipt ID */}
            <div className="mb-4 space-y-2">
              {receipt.payment_id && (
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Payment ID:</span>
                  </p>
                  <p className="text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                    {receipt.payment_id}
                  </p>
                </div>
              )}
              {receipt.id && (
                <div>
                  <p className="text-sm text-gray-600">
                    <span className="font-medium">Receipt ID:</span>
                  </p>
                  <p className="text-sm text-gray-900 font-mono bg-gray-50 px-2 py-1 rounded">
                    {receipt.id}
                  </p>
                </div>
              )}
            </div>

            {/* Receipt Confidence Badge - Always Show */}
            {receipt.confidence_score !== null && receipt.confidence_label && (
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">
                  <span className="font-medium">Receipt Confidence:</span>
                </p>
                <ConfidenceBadge
                  confidence_score={receipt.confidence_score}
                  confidence_label={receipt.confidence_label}
                  confidence_reasons={receipt.confidence_reasons}
                  size="md"
                />
              </div>
            )}

            {/* Confidence Explainability */}
            {receipt.confidence_label && (receipt.confidence_label === 'HIGH' || receipt.confidence_label === 'MEDIUM') && (
              <div className="mb-4">
                <ConfidenceExplainability
                  confidence_score={receipt.confidence_score}
                  confidence_label={receipt.confidence_label}
                  confidence_reasons={receipt.confidence_reasons}
                  isBlocked={false}
                  alwaysExpanded={true}
                  showScore={true}
                />
              </div>
            )}

            {/* Clear Copy */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600 leading-relaxed">
                This receipt reference reflects the current purchase status.
                <br />
                Store policies determine how this information is used.
              </p>
            </div>
          </div>
        </div>

        {/* Receipt Items */}
        {receipt.receipt_items && receipt.receipt_items.length > 0 ? (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>
            <div className="space-y-3">
              {receipt.receipt_items.map((item, idx) => {
                // Use item_name as primary (database column name)
                // Keep name as fallback only for compatibility
                const itemName = (item as any).item_name || (item as any).name || 'Unknown Item';
                
                // Check if this item is disputed
                const disputedItem = dispute?.disputed_items?.find(di => {
                  if (!di.item_name || !itemName) return false;
                  return di.item_name === itemName || di.item_name === itemName.trim();
                });
                const isDisputed = !!disputedItem;
                const disputedQuantity = disputedItem?.quantity || 0;
                const isPartialDispute = isDisputed && disputedQuantity < item.quantity;
                
                return (
                  <div 
                    key={idx} 
                    className={`py-3 border-b border-gray-100 last:border-0 ${
                      isDisputed ? 'bg-amber-50 border-amber-200 rounded-lg px-3 -mx-3' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className={`font-medium ${isDisputed ? 'text-amber-900' : 'text-gray-900'}`}>
                            {itemName}
                          </p>
                          {isDisputed && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-200 text-amber-800">
                              Disputed
                            </span>
                          )}
                        </div>
                        {item.description && (
                          <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          <span className={isDisputed ? 'text-amber-800 font-medium' : 'text-gray-500'}>
                            Quantity: {item.quantity}
                            {isPartialDispute && (
                              <span className="ml-1 text-amber-600">
                                ({disputedQuantity} disputed)
                              </span>
                            )}
                            {isDisputed && !isPartialDispute && (
                              <span className="ml-1 text-amber-600">
                                (all disputed)
                              </span>
                            )}
                          </span>
                          {item.variation && (
                            <span className={isDisputed ? 'text-amber-700' : 'text-gray-500'}>
                              • {item.variation}
                            </span>
                          )}
                          {item.category && (
                            <span className={isDisputed ? 'text-amber-700' : 'text-gray-500'}>
                              • {item.category}
                            </span>
                          )}
                          {item.sku && (
                            <span className={isDisputed ? 'text-amber-700' : 'text-gray-500'}>
                              • SKU: {item.sku}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right ml-4">
                        <p className={`font-semibold ${isDisputed ? 'text-amber-900' : 'text-gray-900'}`}>
                          {formatCurrency(item.total_price || item.item_price, receipt.currency)}
                        </p>
                        {item.item_price && item.quantity > 1 && (
                          <p className={`text-xs mt-1 ${isDisputed ? 'text-amber-700' : 'text-gray-500'}`}>
                            {formatCurrency(item.item_price, receipt.currency)} each
                          </p>
                        )}
                        {isDisputed && disputedItem?.amount_cents && (
                          <p className="text-xs text-amber-600 font-medium mt-1">
                            Disputed: {formatCurrency((disputedItem.amount_cents / 100).toString(), receipt.currency)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-lg font-semibold text-gray-900">Total</p>
              <p className="text-2xl font-bold text-indigo-600">
                {formatCurrency(receipt.amount, receipt.currency)}
              </p>
            </div>
          </div>
        ) : (
          // Fallback when items are missing
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Items</h3>
            <div className="text-center py-8">
              <p className="text-gray-600 mb-2">Item details unavailable</p>
              <p className="text-sm text-gray-500">
                Total amount is still shown below for verification purposes.
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
              <p className="text-lg font-semibold text-gray-900">Total</p>
              <p className="text-2xl font-bold text-indigo-600">
                {formatCurrency(receipt.amount, receipt.currency)}
              </p>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-white rounded-lg shadow-md p-6 text-center">
          <div className="mb-4 pb-4 border-b border-gray-200">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-6 h-6 bg-indigo-600 rounded flex items-center justify-center">
                <span className="text-white font-bold text-xs">PP</span>
              </div>
              <span className="text-sm font-semibold text-indigo-600">ProofPay</span>
            </div>
            <p className="text-xs text-gray-500">Verified digital receipt reference</p>
          </div>
          <p className="text-sm text-gray-600 mb-4">
            Policies remain at merchant discretion.
          </p>
          {share && (
            <div className="space-y-1 text-xs text-gray-500">
              <p>
                This receipt has been viewed {share.view_count} time{share.view_count !== 1 ? 's' : ''}
              </p>
              {share.verified_at && (
                <p>
                  Verified on {new Date(share.verified_at).toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </p>
              )}
              {share.verification_attempts && share.verification_attempts > 0 && (
                <p>
                  Verification attempts: {share.verification_attempts}
                </p>
              )}
            </div>
          )}
          {/* Debug footer - only shown when DEBUG_VERIFY env var is set */}
          {process.env.NEXT_PUBLIC_DEBUG_VERIFY === 'true' && receipt && (
            <div className="mt-4 pt-4 border-t border-gray-200 text-xs text-gray-400 space-y-1">
              <p>Items count: {receipt.receipt_items?.length || 0}</p>
              <p>Receipt ID: {receipt.id?.substring(0, 8)}...</p>
              {receipt.receipt_items && receipt.receipt_items.length > 0 && (
                <p>First item keys: {Object.keys(receipt.receipt_items[0]).join(', ')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

