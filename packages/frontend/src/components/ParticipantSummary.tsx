import { useMemo, memo } from 'react';
import { Bill, Claim } from '../types/bill';

interface ParticipantSummaryProps {
  bill: Bill;
  claims: Claim[];
  participantId: string;
  participantName: string;
}

// interface SummaryBreakdown {
//   itemsSubtotal: number;
//   taxShare: number;
//   tipShare: number;
//   feeShare: number;
//   total: number;
//   claimedItems: Array<{
//     itemName: string;
//     percentage: number;
//     amount: number;
//   }>;
//   taxPercentage: number;
//   tipPercentage: number;
//   feePercentage: number;
// }

function ParticipantSummary({
  bill,
  claims,
  participantId
}: ParticipantSummaryProps) {
  const summary = useMemo(() => {
    if (!bill || !bill.lineItems) {
      return { claimedItems: [], itemsSubtotal: 0, taxShare: 0, tipShare: 0, feeShare: 0, total: 0, taxPercentage: 0, tipPercentage: 0, feePercentage: 0 };
    }
    
    const lineItems = bill.lineItems || [];
    const additionalFees = bill.additionalFees || [];
    
    // Get participant's claims
    const participantClaims = (claims || []).filter(c => c.participantId === participantId);
    
    // Calculate items subtotal
    let itemsSubtotal = 0;
    const claimedItems = participantClaims.map(claim => {
      const item = lineItems.find(i => i.id === claim.itemId);
      const amount = item ? (item.price * claim.percentage / 100) : 0;
      itemsSubtotal += amount;
      
      return {
        itemName: item?.name || 'Unknown Item',
        percentage: claim.percentage,
        amount
      };
    });

    // Add shared items
    lineItems.forEach(item => {
      if (item.isShared && item.sharedAmongCount) {
        const sharedAmount = item.price / item.sharedAmongCount;
        itemsSubtotal += sharedAmount;
        claimedItems.push({
          itemName: `${item.name} (shared)`,
          percentage: 100 / item.sharedAmongCount,
          amount: sharedAmount
        });
      }
    });

    // Calculate bill subtotal (all line items)
    const billSubtotal = lineItems.reduce((sum, i) => sum + i.price, 0);

    // Calculate tax, tip, and fees as percentages of subtotal
    const taxAmount = bill.adjustedTax ?? bill.extractedTax ?? 0;
    const tipAmount = bill.adjustedTip ?? bill.extractedTip ?? 0;
    const totalFees = additionalFees.reduce((sum, f) => sum + f.amount, 0);
    
    const taxPercentage = billSubtotal > 0 ? taxAmount / billSubtotal : 0;
    const tipPercentage = billSubtotal > 0 ? tipAmount / billSubtotal : 0;
    const feePercentage = billSubtotal > 0 ? totalFees / billSubtotal : 0;

    // Apply tax, tip, and fee percentages to participant's items subtotal
    const taxShare = itemsSubtotal * taxPercentage;
    const tipShare = itemsSubtotal * tipPercentage;
    const feeShare = itemsSubtotal * feePercentage;

    const total = itemsSubtotal + taxShare + tipShare + feeShare;

    return {
      itemsSubtotal,
      taxShare,
      tipShare,
      feeShare,
      total,
      claimedItems,
      taxPercentage,
      tipPercentage,
      feePercentage
    };
  }, [bill, claims, participantId]);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="text-center border-b border-gray-200 pb-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          Your Total
        </h2>
        <p className="text-4xl font-bold text-blue-600">
          ${summary.total.toFixed(2)}
        </p>
      </div>

      {/* Breakdown */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 text-lg">Breakdown</h3>
        
        {/* Items */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Items Subtotal</span>
            <span className="font-semibold text-gray-900">
              ${summary.itemsSubtotal.toFixed(2)}
            </span>
          </div>
          
          {summary.claimedItems.length > 0 && (
            <div className="ml-4 space-y-1">
              {summary.claimedItems.map((item, idx) => (
                <div key={idx} className="flex justify-between text-xs text-gray-500">
                  <span>
                    {item.itemName}
                    {item.percentage < 100 && ` (${item.percentage}%)`}
                  </span>
                  <span>${item.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tax */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            Tax ({(summary.taxPercentage * 100).toFixed(1)}%)
          </span>
          <span className="font-semibold text-gray-900">
            ${summary.taxShare.toFixed(2)}
          </span>
        </div>

        {/* Tip */}
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            Tip ({(summary.tipPercentage * 100).toFixed(1)}%)
          </span>
          <span className="font-semibold text-gray-900">
            ${summary.tipShare.toFixed(2)}
          </span>
        </div>

        {/* Service Charges */}
        {summary.feeShare > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">
              Service Charges ({(summary.feePercentage * 100).toFixed(1)}%)
            </span>
            <span className="font-semibold text-gray-900">
              ${summary.feeShare.toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* Total */}
      <div className="pt-4 border-t-2 border-gray-300">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">Total Amount Owed</span>
          <span className="text-2xl font-bold text-blue-600">
            ${summary.total.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Venmo Payment Button */}
      {bill.venmoUsername && summary.total > 0 && (
        <div className="pt-2">
          <a
            href={`venmo://paycharge?txn=pay&recipients=${encodeURIComponent(bill.venmoUsername)}&amount=${summary.total.toFixed(2)}&note=${encodeURIComponent(`TabShare${bill.vendorName ? ' - ' + bill.vendorName : ''}`)}`}
            className="block w-full px-4 py-3 bg-[#008CFF] text-white rounded-lg font-semibold text-center hover:bg-[#0074D4] transition-colors"
            onClick={(e) => {
              // Check if on mobile - if not, use web fallback
              const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
              if (!isMobile) {
                e.preventDefault();
                // Web version - just opens profile, user enters amount
                window.open(`https://venmo.com/${bill.venmoUsername}`, '_blank');
              }
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19.5 3c.9 1.5 1.3 3 1.3 5 0 5.5-4.7 12.7-8.5 17H5.2L2.5 3.5l6.2-.6 1.5 12c1.4-2.3 3.1-5.9 3.1-8.4 0-1.8-.3-3-1-4.2L19.5 3z"/>
              </svg>
              Pay ${summary.total.toFixed(2)} with Venmo
            </span>
          </a>
          <p className="text-xs text-gray-500 text-center mt-2">
            To @{bill.venmoUsername}
          </p>
        </div>
      )}

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          💡 Your total updates automatically as you and others claim items
        </p>
      </div>
    </div>
  );
}

// Memoize component to prevent unnecessary re-renders
export default memo(ParticipantSummary);
