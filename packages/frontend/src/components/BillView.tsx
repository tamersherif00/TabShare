import { useState, useMemo, memo } from 'react';
import { Bill, Claim, LineItemDisplay, ClaimInfo } from '../types/bill';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface BillViewProps {
  billId: string;
  bill: Bill;
  isPayer: boolean;
  userId: string;
  userName: string;
  claims: Claim[];
  onClaimsChange?: (claims: Claim[]) => void;
}

function BillView({ billId, bill, isPayer, userId, userName, claims, onClaimsChange }: BillViewProps) {
  const [error, setError] = useState<string | null>(null);

  // Calculate line item display data with claims
  const lineItemsDisplay: LineItemDisplay[] = useMemo(() => {
    if (!bill || !bill.lineItems) return [];

    return (bill.lineItems || []).map(item => {
      const itemClaims = (claims || []).filter(c => c.itemId === item.id);
      const claimInfos: ClaimInfo[] = itemClaims.map(c => ({
        participantId: c.participantId,
        participantName: c.participantName,
        percentage: c.percentage,
        amount: c.amount
      }));

      const totalClaimed = itemClaims.reduce((sum, c) => sum + c.percentage, 0);
      const remaining = 100 - totalClaimed;

      let claimStatus: LineItemDisplay['claimStatus'];
      if (totalClaimed === 0) claimStatus = 'unclaimed';
      else if (totalClaimed < 100) claimStatus = 'partial';
      else if (totalClaimed === 100) claimStatus = 'full';
      else claimStatus = 'over-claimed';

      return {
        ...item,
        claims: claimInfos,
        remainingPercentage: remaining,
        claimStatus
      };
    });
  }, [bill, claims]);

  const handleClaimItem = async (itemId: string, percentage: number) => {
    if (!userId) {
      setError('Please join the bill first to claim items');
      return;
    }
    
    const existingClaim = claims.find(c => c.participantId === userId && c.itemId === itemId);
    const item = bill.lineItems?.find(i => i.id === itemId);
    const amount = item ? (item.price * percentage / 100) : 0;
    const previousClaims = [...claims]; // Save for rollback
    
    if (existingClaim) {
      // OPTIMISTIC UPDATE: Update UI immediately
      const updatedClaim = { ...existingClaim, percentage, amount, updatedAt: new Date().toISOString() };
      const updatedClaims = claims.map(c => c.id === existingClaim.id ? updatedClaim : c);
      onClaimsChange?.(updatedClaims);
      
      // Then make API call
      try {
        const response = await fetch(`${API_BASE_URL}/api/claims/${existingClaim.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ percentage })
        });
        
        if (!response.ok) {
          // Rollback on failure
          onClaimsChange?.(previousClaims);
          throw new Error('Failed to update claim');
        }
      } catch (err) {
        onClaimsChange?.(previousClaims);
        console.error('Failed to update claim:', err);
        setError('Failed to update claim. Please try again.');
      }
    } else {
      // OPTIMISTIC UPDATE: Add new claim to UI immediately
      const tempId = `temp-${Date.now()}`;
      const newClaim: Claim = {
        id: tempId,
        billId,
        participantId: userId,
        participantName: userName,
        itemId,
        percentage,
        amount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      onClaimsChange?.([...claims, newClaim]);
      
      // Then make API call
      try {
        const response = await fetch(`${API_BASE_URL}/api/claims`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            billId,
            participantId: userId,
            participantName: userName,
            itemId,
            percentage
          })
        });
        
        if (!response.ok) {
          // Rollback on failure
          onClaimsChange?.(previousClaims);
          throw new Error('Failed to create claim');
        }
        
        // Update with real ID from server
        const data = await response.json();
        if (data.claim?.id) {
          const finalClaims = claims.map(c => c.id === tempId ? { ...newClaim, id: data.claim.id } : c);
          onClaimsChange?.([...previousClaims, { ...newClaim, id: data.claim.id }]);
        }
      } catch (err) {
        onClaimsChange?.(previousClaims);
        console.error('Failed to create claim:', err);
        setError('Failed to create claim. Please try again.');
      }
    }
  };

  const handleUnclaimItem = async (itemId: string) => {
    if (!userId) {
      setError('Please join the bill first');
      return;
    }
    
    const existingClaim = claims.find(c => c.participantId === userId && c.itemId === itemId);
    if (!existingClaim) return;
    
    const previousClaims = [...claims]; // Save for rollback
    
    // OPTIMISTIC UPDATE: Remove from UI immediately
    const updatedClaims = claims.filter(c => c.id !== existingClaim.id);
    onClaimsChange?.(updatedClaims);
    
    // Then make API call
    try {
      const response = await fetch(`${API_BASE_URL}/api/claims/${existingClaim.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        // Rollback on failure
        onClaimsChange?.(previousClaims);
        throw new Error('Failed to delete claim');
      }
    } catch (err) {
      onClaimsChange?.(previousClaims);
      console.error('Failed to unclaim item:', err);
      setError('Failed to unclaim. Please try again.');
    }
  };

  if (!bill) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700">Bill not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-red-700 text-sm">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="text-red-600 text-xs underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Receipt Metadata */}
      {(bill.vendorName || bill.receiptDate || bill.receiptTime || bill.numberOfGuests) && (
        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="space-y-2 text-sm">
            {bill.vendorName && (
              <div className="flex items-center gap-2 text-gray-700">
                <span className="font-semibold">🏪</span>
                <span className="font-medium">{bill.vendorName}</span>
              </div>
            )}
            <div className="flex items-center gap-4 text-gray-600">
              {(bill.receiptDate || bill.receiptTime) && (
                <div className="flex items-center gap-1">
                  <span>📅</span>
                  <span>
                    {bill.receiptDate && bill.receiptDate}
                    {bill.receiptDate && bill.receiptTime && ' '}
                    {bill.receiptTime && bill.receiptTime}
                  </span>
                </div>
              )}
              {bill.numberOfGuests && (
                <div className="flex items-center gap-1">
                  <span>👥</span>
                  <span>{bill.numberOfGuests} {bill.numberOfGuests === 1 ? 'guest' : 'guests'}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="space-y-3">
        {lineItemsDisplay.map(item => (
          <LineItemCard
            key={item.id}
            item={item}
            isPayer={isPayer}
            userId={userId}
            onClaim={handleClaimItem}
            onUnclaim={handleUnclaimItem}
          />
        ))}
      </div>
    </div>
  );
}

interface LineItemCardProps {
  item: LineItemDisplay;
  isPayer: boolean;
  userId: string;
  onClaim: (itemId: string, percentage: number) => void;
  onUnclaim: (itemId: string) => void;
}

// Memoize LineItemCard to prevent unnecessary re-renders
const LineItemCard = memo(function LineItemCard({ item, isPayer: _isPayer, userId, onClaim, onUnclaim }: LineItemCardProps) {
  const [showClaimInput, setShowClaimInput] = useState(false);
  const [claimPercentage, setClaimPercentage] = useState(100);

  const userClaim = item.claims.find((c: ClaimInfo) => c.participantId === userId);
  const canClaim = !!userId && !item.isShared && item.remainingPercentage > 0;
  const hasClaim = !!userClaim;

  const statusColors = {
    'unclaimed': 'border-gray-300 bg-white',
    'partial': 'border-yellow-300 bg-yellow-50',
    'full': 'border-green-300 bg-green-50',
    'over-claimed': 'border-red-300 bg-red-50'
  };

  const handleQuickClaim = (percentage: number) => {
    onClaim(item.id, percentage);
    setShowClaimInput(false);
  };

  const handleCustomClaim = () => {
    const maxAllowed = item.remainingPercentage + (userClaim?.percentage || 0);
    if (claimPercentage > 0 && claimPercentage <= maxAllowed) {
      onClaim(item.id, claimPercentage);
      setShowClaimInput(false);
      setClaimPercentage(userClaim?.percentage || 100);
    }
  };

  const handleUnclaim = () => {
    onUnclaim(item.id);
  };

  const handleShowClaimInput = () => {
    // Set initial percentage to current claim if editing, otherwise 100
    setClaimPercentage(userClaim?.percentage || 100);
    setShowClaimInput(true);
  };

  return (
    <div className={`border-2 rounded-lg p-4 transition-all duration-200 hover:shadow-md ${statusColors[item.claimStatus]}`}>
      {/* Header Section */}
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{item.name}</h3>
          <div className="flex items-baseline gap-2">
            <p className="text-lg font-bold text-blue-600">${item.price.toFixed(2)}</p>
            {!item.isShared && item.remainingPercentage < 100 && (
              <span className="text-xs text-gray-500">
                ({100 - item.remainingPercentage}% claimed)
              </span>
            )}
          </div>
        </div>
        
        {item.isShared && (
          <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded-full">
            Shared ({item.sharedAmongCount})
          </span>
        )}
      </div>

      {/* Claims Display */}
      {item.claims.length > 0 && !item.isShared && (
        <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
          <p className="text-xs text-gray-600 mb-1">Claimed by:</p>
          <div className="flex flex-wrap gap-1.5">
            {item.claims.map((claim, idx) => (
              <div 
                key={idx} 
                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium ${
                  claim.participantId === userId 
                    ? 'bg-green-100 text-green-800 border border-green-300' 
                    : 'bg-blue-50 text-blue-700'
                }`}
              >
                <span>{claim.participantId === userId ? 'You' : claim.participantName}</span>
                <span className="font-bold">{claim.percentage}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Progress Bar */}
      {!item.isShared && (
        <div className="mb-3">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-gray-600">Available</span>
            <span className={`font-semibold ${
              item.claimStatus === 'over-claimed' ? 'text-red-600' : 
              item.claimStatus === 'full' ? 'text-green-600' :
              'text-gray-900'
            }`}>
              {item.remainingPercentage}%
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                item.claimStatus === 'over-claimed' ? 'bg-red-500' :
                item.claimStatus === 'full' ? 'bg-green-500' :
                item.claimStatus === 'partial' ? 'bg-yellow-500' :
                'bg-gray-300'
              }`}
              style={{ width: `${Math.min(100 - item.remainingPercentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Claim Actions */}
      {canClaim && !hasClaim && (
        <div className="space-y-2">
          {!showClaimInput ? (
            <div className="flex gap-2">
              <button
                onClick={() => handleQuickClaim(100)}
                disabled={item.remainingPercentage < 100}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Claim All
              </button>
              <button
                onClick={handleShowClaimInput}
                className="flex-1 px-4 py-2 bg-white border-2 border-blue-600 text-blue-600 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
              >
                Split
              </button>
            </div>
          ) : (
            <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-xs font-medium text-gray-700">Choose your share</p>
              
              {/* Quick Percentage Buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map(pct => (
                  <button
                    key={pct}
                    onClick={() => handleQuickClaim(pct)}
                    disabled={item.remainingPercentage < pct}
                    className="px-2 py-1.5 bg-blue-600 text-white rounded font-semibold text-sm hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              
              {/* Custom Percentage Slider */}
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max={item.remainingPercentage}
                  value={claimPercentage}
                  onChange={(e) => setClaimPercentage(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-semibold text-gray-900 w-12 text-right text-sm">
                  {claimPercentage}%
                </span>
              </div>
              <p className="text-xs text-gray-600 text-center">
                ${(item.price * claimPercentage / 100).toFixed(2)}
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClaimInput(false)}
                  className="flex-1 px-3 py-1.5 bg-gray-500 text-white rounded font-semibold text-sm hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomClaim}
                  className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded font-semibold text-sm hover:bg-green-700 transition-colors"
                >
                  Claim {claimPercentage}%
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit/Unclaim */}
      {hasClaim && !item.isShared && (
        <div className="space-y-2">
          {!showClaimInput ? (
            <>
              <div className="p-2 bg-green-50 border border-green-200 rounded">
                <p className="text-xs text-green-800 font-medium">
                  ✓ You claimed {userClaim?.percentage}% (${(item.price * (userClaim?.percentage || 0) / 100).toFixed(2)})
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleShowClaimInput}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                >
                  Change
                </button>
                <button
                  onClick={handleUnclaim}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
                >
                  Unclaim
                </button>
              </div>
            </>
          ) : (
            <div className="space-y-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <p className="text-xs font-medium text-gray-700">
                Adjust (currently {userClaim?.percentage}%)
              </p>
              
              {/* Quick Percentage Buttons */}
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map(pct => (
                  <button
                    key={pct}
                    onClick={() => handleQuickClaim(pct)}
                    disabled={item.remainingPercentage + (userClaim?.percentage || 0) < pct}
                    className="px-2 py-1.5 bg-amber-600 text-white rounded font-semibold text-sm hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {pct}%
                  </button>
                ))}
              </div>
              
              {/* Custom Percentage Slider */}
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min="1"
                  max={item.remainingPercentage + (userClaim?.percentage || 0)}
                  value={claimPercentage}
                  onChange={(e) => setClaimPercentage(Number(e.target.value))}
                  className="flex-1"
                />
                <span className="font-semibold text-gray-900 w-12 text-right text-sm">
                  {claimPercentage}%
                </span>
              </div>
              <p className="text-xs text-gray-600 text-center">
                ${(item.price * claimPercentage / 100).toFixed(2)}
              </p>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setShowClaimInput(false)}
                  className="flex-1 px-3 py-1.5 bg-gray-500 text-white rounded font-semibold text-sm hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomClaim}
                  className="flex-1 px-3 py-1.5 bg-green-600 text-white rounded font-semibold text-sm hover:bg-green-700 transition-colors"
                >
                  Update to {claimPercentage}%
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {item.isShared && (
        <p className="text-sm text-gray-600 italic">
          This item is being split equally by the payer
        </p>
      )}
    </div>
  );
});

// Memoize main component
export default memo(BillView);
