import { useState, useMemo, useEffect, useCallback } from 'react';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';
import { Bill, Claim, Fee } from '../types/bill';
import BillSharing from './BillSharing';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface PayerDashboardProps {
  billId: string;
  payerId: string;
  payerName?: string;
}

interface ParticipantTotal {
  participantId: string;
  participantName: string;
  itemsSubtotal: number;
  taxShare: number;
  tipShare: number;
  feeShare: number;
  total: number;
  claimedItems: string[];
}

export default function PayerDashboard({ billId, payerId, payerName }: PayerDashboardProps) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [showSharing, setShowSharing] = useState(false);
  const [editingTax, setEditingTax] = useState(false);
  const [editingTip, setEditingTip] = useState(false);
  const [newFee, setNewFee] = useState({ description: '', amount: '' });
  const [showAddFee, setShowAddFee] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingSharedItem, setEditingSharedItem] = useState<string | null>(null);
  const [sharedCount, setSharedCount] = useState<number>(2);
  const [numberOfPeople, setNumberOfPeople] = useState<number>(2);
  const [editingNumberOfPeople, setEditingNumberOfPeople] = useState(false);
  const [editingVenmo, setEditingVenmo] = useState(false);
  const [venmoUsername, setVenmoUsername] = useState('');
  const [selectedItemsForCombine, setSelectedItemsForCombine] = useState<string[]>([]);
  const [combineMode, setCombineMode] = useState(false);

  // Update numberOfPeople when bill loads
  useEffect(() => {
    if (!billId) return;
    
    // Try to load from localStorage first
    const stored = localStorage.getItem(`bill_${billId}_numberOfPeople`);
    if (stored) {
      setNumberOfPeople(parseInt(stored));
    } else if (bill?.numberOfGuests && numberOfPeople === 2) {
      setNumberOfPeople(bill.numberOfGuests);
    }
  }, [bill, billId]);
  
  // Save numberOfPeople to localStorage when it changes
  useEffect(() => {
    if (billId && numberOfPeople !== 2) {
      localStorage.setItem(`bill_${billId}_numberOfPeople`, numberOfPeople.toString());
    }
  }, [numberOfPeople, billId]);

  // Fetch bill data on mount
  useEffect(() => {
    fetchBillData();
  }, [billId]);

  async function fetchBillData() {
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch bill');
      }
      
      const data = await response.json();
      // Map backend 'items' to frontend 'lineItems' and transform field names
      const items = data.bill.lineItems || data.bill.items || [];
      const lineItems = items.map((item: any) => ({
        id: item.id,
        name: item.name || item.description || '',
        price: item.price || item.amount || 0,
        isShared: item.isShared || false,
        sharedAmongCount: item.sharedAmongCount,
        combinedFrom: item.combinedFrom, // Preserve combined items info for uncombining
      }));
      
      const bill = {
        ...data.bill,
        lineItems,
        additionalFees: data.bill.additionalFees || [],
        extractedTax: data.bill.extractedTax || data.bill.tax || 0,
        extractedTip: data.bill.extractedTip || data.bill.tip || 0,
        adjustedTax: data.bill.adjustedTax,
        adjustedTip: data.bill.adjustedTip,
        vendorName: data.bill.vendorName || data.bill.merchant,
        receiptDate: data.bill.receiptDate || data.bill.date,
        receiptTime: data.bill.receiptTime,
        numberOfGuests: data.bill.numberOfGuests,
        claims: data.bill.claims || []
      };
      setBill(bill);
      setClaims(bill.claims || []);
      setVenmoUsername(data.bill.venmoUsername || '');
      
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load bill:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bill');
      setIsLoading(false);
    }
  }

  // Handle WebSocket messages for real-time updates
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'CLAIM_CREATED':
        setClaims(prev => {
          // Avoid duplicates
          if (prev.some(c => c.id === message.payload.claim.id)) return prev;
          return [...prev, message.payload.claim];
        });
        break;
      case 'CLAIM_UPDATED':
        setClaims(prev =>
          prev.map(c => c.id === message.payload.claim.id ? message.payload.claim : c)
        );
        break;
      case 'CLAIM_DELETED':
        setClaims(prev => prev.filter(c => c.id !== message.payload.claimId));
        break;
      case 'BILL_UPDATED':
        if (message.payload.updates) {
          setBill(prev => prev ? { ...prev, ...message.payload.updates } : null);
        }
        break;
      case 'PARTICIPANT_JOINED':
        // Could show notification
        break;
    }
  }, []);

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    billId,
    userId: payerId,
    onMessage: handleWebSocketMessage
  });

  // Calculate participant totals
  const participantTotals: ParticipantTotal[] = useMemo(() => {
    if (!bill || !bill.lineItems) return [];

    const participantMap = new Map<string, ParticipantTotal>();
    const lineItems = bill.lineItems || [];
    const additionalFees = bill.additionalFees || [];

    // Process claims
    (claims || []).forEach(claim => {
      const item = lineItems.find(i => i.id === claim.itemId);
      if (!item) return;

      const amount = item.price * claim.percentage / 100;

      if (!participantMap.has(claim.participantId)) {
        participantMap.set(claim.participantId, {
          participantId: claim.participantId,
          participantName: claim.participantName,
          itemsSubtotal: 0,
          taxShare: 0,
          tipShare: 0,
          feeShare: 0,
          total: 0,
          claimedItems: []
        });
      }

      const participant = participantMap.get(claim.participantId)!;
      participant.itemsSubtotal += amount;
      participant.claimedItems.push(item.name);
    });

    // Calculate bill subtotal and tax/tip/fee percentages
    const billSubtotal = lineItems.reduce((sum, i) => sum + i.price, 0);
    const taxAmount = bill.adjustedTax ?? bill.extractedTax ?? 0;
    const tipAmount = bill.adjustedTip ?? bill.extractedTip ?? 0;
    const totalFees = additionalFees.reduce((sum, f) => sum + f.amount, 0);
    
    const taxPercentage = billSubtotal > 0 ? taxAmount / billSubtotal : 0;
    const tipPercentage = billSubtotal > 0 ? tipAmount / billSubtotal : 0;
    const feePercentage = billSubtotal > 0 ? totalFees / billSubtotal : 0;

    participantMap.forEach(participant => {
      // Apply tax, tip, and fee percentages to participant's items subtotal
      participant.taxShare = participant.itemsSubtotal * taxPercentage;
      participant.tipShare = participant.itemsSubtotal * tipPercentage;
      participant.feeShare = participant.itemsSubtotal * feePercentage;
      
      participant.total = participant.itemsSubtotal + participant.taxShare + participant.tipShare + participant.feeShare;
    });

    return Array.from(participantMap.values());
  }, [bill, claims]);

  // Calculate validation warnings
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _warnings = useMemo(() => {
    if (!bill || !bill.lineItems) return [];
    const warns: string[] = [];

    // Check over-claimed items
    (bill.lineItems || []).forEach(item => {
      if (item.isShared) return;
      const totalClaimed = (claims || [])
        .filter(c => c.itemId === item.id)
        .reduce((sum, c) => sum + c.percentage, 0);
      
      if (totalClaimed > 100) {
        warns.push(`"${item.name}" is over-claimed by ${totalClaimed - 100}%`);
      }
    });

    // Check total mismatch
    const billTotal = (bill.lineItems || []).reduce((sum, i) => sum + i.price, 0) +
      (bill.adjustedTax ?? bill.extractedTax ?? 0) +
      (bill.adjustedTip ?? bill.extractedTip ?? 0) +
      (bill.additionalFees || []).reduce((sum, f) => sum + f.amount, 0);
    
    const participantsTotal = participantTotals.reduce((sum, p) => sum + p.total, 0);
    const difference = Math.abs(billTotal - participantsTotal);

    if (difference > 0.01) {
      const direction = participantsTotal > billTotal ? 'over' : 'under';
      const itemsSubtotal = (bill.lineItems || []).reduce((sum, i) => sum + i.price, 0);
      const tax = bill.adjustedTax ?? bill.extractedTax ?? 0;
      const tip = bill.adjustedTip ?? bill.extractedTip ?? 0;
      const fees = (bill.additionalFees || []).reduce((sum, f) => sum + f.amount, 0);
      
      warns.push(
        `Total mismatch: Claimed $${participantsTotal.toFixed(2)} but bill total is $${billTotal.toFixed(2)} ` +
        `(${direction} by $${difference.toFixed(2)}). ` +
        `Breakdown: Items $${itemsSubtotal.toFixed(2)} + Tax $${tax.toFixed(2)} + Tip $${tip.toFixed(2)} + Fees $${fees.toFixed(2)}`
      );
    }

    return warns;
  }, [bill, claims, participantTotals]);

  const handleUpdateTax = async (newTax: number) => {
    if (!bill) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/amounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tax: newTax, 
          tip: bill.adjustedTip ?? bill.extractedTip,
          additionalFees: bill.additionalFees
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Merge response with existing bill to preserve lineItems
        setBill(prev => prev ? { ...prev, ...data.bill, lineItems: prev.lineItems } : data.bill);
      }
    } catch (err) {
      console.error('Failed to update tax:', err);
    }
    
    setEditingTax(false);
  };

  const handleUpdateTip = async (newTip: number) => {
    if (!bill) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/amounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tax: bill.adjustedTax ?? bill.extractedTax,
          tip: newTip,
          additionalFees: bill.additionalFees
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Merge response with existing bill to preserve lineItems
        setBill(prev => prev ? { ...prev, ...data.bill, lineItems: prev.lineItems } : data.bill);
      }
    } catch (err) {
      console.error('Failed to update tip:', err);
    }
    
    setEditingTip(false);
  };

  const handleAddFee = async () => {
    if (!bill || !newFee.description || !newFee.amount) return;
    
    const fee: Fee = {
      id: 'fee-' + Date.now(),
      description: newFee.description,
      amount: parseFloat(newFee.amount)
    };

    const updatedFees = [...(bill.additionalFees || []), fee];
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/amounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tax: bill.adjustedTax ?? bill.extractedTax,
          tip: bill.adjustedTip ?? bill.extractedTip,
          additionalFees: updatedFees
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Merge response with existing bill to preserve lineItems
        setBill(prev => prev ? { ...prev, ...data.bill, lineItems: prev.lineItems } : data.bill);
      }
    } catch (err) {
      console.error('Failed to add fee:', err);
    }
    
    setNewFee({ description: '', amount: '' });
    setShowAddFee(false);
  };

  const handleRemoveFee = async (feeId: string) => {
    if (!bill) return;
    
    const updatedFees = bill.additionalFees.filter(f => f.id !== feeId);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/amounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tax: bill.adjustedTax ?? bill.extractedTax,
          tip: bill.adjustedTip ?? bill.extractedTip,
          additionalFees: updatedFees
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Merge response with existing bill to preserve lineItems
        setBill(prev => prev ? { ...prev, ...data.bill, lineItems: prev.lineItems } : data.bill);
      }
    } catch (err) {
      console.error('Failed to remove fee:', err);
    }
  };

  const handleToggleShared = async (itemId: string, sharedCount?: number) => {
    if (!bill || !bill.lineItems) return;
    
    const updatedLineItems = (bill.lineItems || []).map(item =>
      item.id === itemId
        ? { ...item, isShared: !item.isShared, sharedAmongCount: sharedCount }
        : item
    );
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems: updatedLineItems })
      });
      
      if (response.ok) {
        const data = await response.json();
        // For items update, use the response lineItems
        setBill(prev => prev ? { ...prev, ...data.bill } : data.bill);
      }
    } catch (err) {
      console.error('Failed to update item:', err);
    }
    
    setEditingSharedItem(null);
    setSharedCount(2);
  };

  const handleSetShared = (itemId: string) => {
    setEditingSharedItem(itemId);
    const item = bill?.lineItems.find(i => i.id === itemId);
    setSharedCount(item?.sharedAmongCount || 2);
  };

  const handleToggleItemSelection = (itemId: string) => {
    setSelectedItemsForCombine(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    );
  };

  const handleCombineItems = async () => {
    if (!bill || selectedItemsForCombine.length < 2) return;
    
    const itemsToCombine = (bill.lineItems || []).filter(item => 
      selectedItemsForCombine.includes(item.id)
    );
    
    // Create combined item with original items stored for uncombining
    const combinedName = itemsToCombine.map(i => i.name).join(' + ');
    const combinedPrice = itemsToCombine.reduce((sum, i) => sum + i.price, 0);
    const combinedId = itemsToCombine[0].id; // Keep first item's ID
    
    // Store original items for uncombining (flatten any already-combined items)
    const combinedFrom = itemsToCombine.flatMap(item => 
      item.combinedFrom || [{ id: item.id, name: item.name, price: item.price }]
    );
    
    // Create new line items array - remove all selected items except first, then update first with combined data
    const newLineItems = (bill.lineItems || [])
      .filter(item => !selectedItemsForCombine.includes(item.id) || item.id === combinedId)
      .map(item => 
        item.id === combinedId 
          ? { ...item, name: combinedName, price: combinedPrice, combinedFrom }
          : item
      );
    
    // Optimistically update UI first
    setBill(prev => prev ? { ...prev, lineItems: newLineItems } : null);
    
    // Reset selection immediately for better UX
    setSelectedItemsForCombine([]);
    setCombineMode(false);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems: newLineItems })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Update with server response, preserving lineItems if not in response
        const serverLineItems = data.bill?.lineItems || newLineItems;
        setBill(prev => prev ? { ...prev, ...data.bill, lineItems: serverLineItems } : data.bill);
      } else {
        // Rollback on failure
        console.error('Failed to combine items - server error');
        fetchBillData();
      }
    } catch (err) {
      console.error('Failed to combine items:', err);
      // Rollback on failure
      fetchBillData();
    }
  };

  const handleUncombineItem = async (itemId: string) => {
    if (!bill) return;
    
    const item = bill.lineItems.find(i => i.id === itemId);
    if (!item?.combinedFrom || item.combinedFrom.length < 2) return;
    
    // Restore original items
    const restoredItems = item.combinedFrom.map((orig, idx) => ({
      id: idx === 0 ? item.id : `${item.id}-${idx}`, // Keep first ID, generate new ones for rest
      name: orig.name,
      price: orig.price,
      isShared: false,
    }));
    
    // Replace combined item with original items
    const newLineItems = (bill.lineItems || []).flatMap(i => 
      i.id === itemId ? restoredItems : [i]
    );
    
    // Optimistically update UI
    setBill(prev => prev ? { ...prev, lineItems: newLineItems } : null);
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/items`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineItems: newLineItems })
      });
      
      if (response.ok) {
        const data = await response.json();
        const serverLineItems = data.bill?.lineItems || newLineItems;
        setBill(prev => prev ? { ...prev, ...data.bill, lineItems: serverLineItems } : data.bill);
      } else {
        console.error('Failed to uncombine items - server error');
        fetchBillData();
      }
    } catch (err) {
      console.error('Failed to uncombine items:', err);
      fetchBillData();
    }
  };

  const handleUpdateVenmo = async () => {
    if (!bill) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/api/bills/${billId}/amounts`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          tax: bill.adjustedTax ?? bill.extractedTax,
          tip: bill.adjustedTip ?? bill.extractedTip,
          additionalFees: bill.additionalFees,
          venmoUsername: venmoUsername.trim()
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        // Merge response with existing bill to preserve lineItems
        setBill(prev => prev ? { ...prev, ...data.bill, lineItems: prev.lineItems } : data.bill);
      }
    } catch (err) {
      console.error('Failed to update Venmo:', err);
    }
    
    setEditingVenmo(false);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading bill...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error || !bill) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700">{error || 'Bill not found'}</p>
        <button
          onClick={fetchBillData}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const billSubtotal = (bill.lineItems || []).reduce((sum, i) => sum + i.price, 0);
  const tax = bill.adjustedTax ?? bill.extractedTax ?? 0;
  const tip = bill.adjustedTip ?? bill.extractedTip ?? 0;
  const fees = (bill.additionalFees || []).reduce((sum, f) => sum + f.amount, 0);
  const grandTotal = billSubtotal + tax + tip + fees;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-start mb-4">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-gray-900">Payer Dashboard</h1>
            <p className="text-gray-600">
              {payerName ? `Payer: ${payerName} • ` : ''}Monitor and manage your bill split
            </p>
            
            {/* Receipt Metadata */}
            {(bill.vendorName || bill.receiptDate || bill.receiptTime || bill.numberOfGuests) && (
              <div className="mt-3 space-y-1 text-sm">
                {bill.vendorName && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <span className="font-semibold">🏪 Restaurant:</span>
                    <span>{bill.vendorName}</span>
                  </div>
                )}
                {(bill.receiptDate || bill.receiptTime) && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <span className="font-semibold">📅 Date/Time:</span>
                    <span>
                      {bill.receiptDate && bill.receiptDate}
                      {bill.receiptDate && bill.receiptTime && ' at '}
                      {bill.receiptTime && bill.receiptTime}
                    </span>
                  </div>
                )}
                {bill.numberOfGuests && (
                  <div className="flex items-center gap-2 text-gray-700">
                    <span className="font-semibold">👥 Party Size:</span>
                    <span>{bill.numberOfGuests} {bill.numberOfGuests === 1 ? 'guest' : 'guests'}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSharing(!showSharing)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            {showSharing ? 'Hide' : 'Share Bill'}
          </button>
        </div>

        {/* Connection Status */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-600">
            {isConnected ? 'Live updates active' : 'Reconnecting...'}
          </span>
        </div>
      </div>

      {/* Sharing Component */}
      {showSharing && (
        <BillSharing 
          billId={billId} 
          shareUrl={`${window.location.origin}/bill/${billId}`} 
        />
      )}

      {/* Claims Progress */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="font-semibold text-gray-900 mb-4">📊 Claims Progress</h3>
        
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Claimed: ${participantTotals.reduce((sum, p) => sum + p.total, 0).toFixed(2)}</span>
            <span>Total: ${grandTotal.toFixed(2)}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
            <div 
              className="bg-green-500 h-full transition-all duration-300 flex items-center justify-end pr-2"
              style={{ width: `${Math.min((participantTotals.reduce((sum, p) => sum + p.total, 0) / grandTotal) * 100, 100)}%` }}
            >
              {participantTotals.reduce((sum, p) => sum + p.total, 0) > 0 && (
                <span className="text-xs text-white font-semibold">
                  {Math.round((participantTotals.reduce((sum, p) => sum + p.total, 0) / grandTotal) * 100)}%
                </span>
              )}
            </div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Unclaimed: ${(grandTotal - participantTotals.reduce((sum, p) => sum + p.total, 0)).toFixed(2)}</span>
            <span>{participantTotals.length} participant{participantTotals.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* Participant List */}
        {participantTotals.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700">Participants:</h4>
            {participantTotals.map((participant) => (
              <div key={participant.participantId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span className="text-sm font-medium text-gray-900">{participant.participantName}</span>
                <span className="text-sm text-gray-600">${participant.total.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bill Summary - v2 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Bill Summary</h2>
        
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="font-semibold">${billSubtotal.toFixed(2)}</span>
          </div>

          {/* Tax */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Tax</span>
            {editingTax ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.01"
                  defaultValue={tax}
                  onBlur={(e) => handleUpdateTax(parseFloat(e.target.value))}
                  className="w-24 px-2 py-1 border border-gray-300 rounded"
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => setEditingTax(true)}
                className="font-semibold hover:text-blue-600"
              >
                ${tax.toFixed(2)} ✏️
              </button>
            )}
          </div>

          {/* Tip */}
          <div className="flex justify-between items-center">
            <span className="text-gray-600">Tip</span>
            {editingTip ? (
              <input
                type="number"
                step="0.01"
                defaultValue={tip}
                onBlur={(e) => handleUpdateTip(parseFloat(e.target.value))}
                className="w-24 px-2 py-1 border border-gray-300 rounded"
                autoFocus
              />
            ) : (
              <button
                onClick={() => setEditingTip(true)}
                className="font-semibold hover:text-blue-600"
              >
                ${tip.toFixed(2)} ✏️
              </button>
            )}
          </div>

          {/* Additional Fees */}
          {(bill.additionalFees || []).map(fee => (
            <div key={fee.id} className="flex justify-between items-center">
              <span className="text-gray-600">{fee.description}</span>
              <div className="flex items-center gap-2">
                <span className="font-semibold">${fee.amount.toFixed(2)}</span>
                <button
                  onClick={() => handleRemoveFee(fee.id)}
                  className="text-red-600 hover:text-red-700"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {/* Add Fee */}
          {showAddFee ? (
            <div className="flex gap-2 pt-2">
              <input
                type="text"
                placeholder="Description"
                value={newFee.description}
                onChange={(e) => setNewFee({ ...newFee, description: e.target.value })}
                className="flex-1 px-3 py-2 border border-gray-300 rounded"
              />
              <input
                type="number"
                step="0.01"
                placeholder="Amount"
                value={newFee.amount}
                onChange={(e) => setNewFee({ ...newFee, amount: e.target.value })}
                className="w-24 px-3 py-2 border border-gray-300 rounded"
              />
              <button
                onClick={handleAddFee}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Add
              </button>
              <button
                onClick={() => setShowAddFee(false)}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowAddFee(true)}
              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              + Add Fee
            </button>
          )}

          <div className="pt-3 border-t-2 border-gray-300 flex justify-between">
            <span className="text-lg font-bold">Grand Total</span>
            <span className="text-lg font-bold">${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Payment Settings */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">💳 Payment Settings</h2>
        
        <div className="space-y-4">
          {/* Venmo Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Venmo Username
            </label>
            <p className="text-xs text-gray-500 mb-2">
              Add your Venmo username so participants can pay you directly
            </p>
            {editingVenmo ? (
              <div className="flex gap-2">
                <div className="flex-1 flex items-center">
                  <span className="px-3 py-2 bg-gray-100 border border-r-0 border-gray-300 rounded-l text-gray-500">@</span>
                  <input
                    type="text"
                    value={venmoUsername}
                    onChange={(e) => setVenmoUsername(e.target.value.replace('@', ''))}
                    placeholder="username"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-r focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    autoFocus
                  />
                </div>
                <button
                  onClick={handleUpdateVenmo}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingVenmo(false);
                    setVenmoUsername(bill.venmoUsername || '');
                  }}
                  className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                {venmoUsername ? (
                  <>
                    <span className="px-3 py-2 bg-blue-50 text-blue-700 rounded font-medium">
                      @{venmoUsername}
                    </span>
                    <button
                      onClick={() => setEditingVenmo(true)}
                      className="text-blue-600 hover:text-blue-700 text-sm"
                    >
                      Edit
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setEditingVenmo(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                  >
                    + Add Venmo
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Participants */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Participants ({participantTotals.length})
        </h2>
        
        {participantTotals.length === 0 ? (
          <p className="text-gray-600 text-center py-4">
            No participants have joined yet. Share the bill link!
          </p>
        ) : (
          <div className="space-y-4">
            {participantTotals.map(participant => (
              <div
                key={participant.participantId}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {participant.participantName}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {participant.claimedItems.length} items claimed
                    </p>
                  </div>
                  <span className="text-xl font-bold text-blue-600">
                    ${participant.total.toFixed(2)}
                  </span>
                </div>
                
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between">
                    <span>Items:</span>
                    <span>${participant.itemsSubtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tax:</span>
                    <span>${participant.taxShare.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tip:</span>
                    <span>${participant.tipShare.toFixed(2)}</span>
                  </div>
                  {participant.feeShare > 0 && (
                    <div className="flex justify-between">
                      <span>Service Charges:</span>
                      <span>${participant.feeShare.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Line Items Management */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900">Line Items</h2>
          
          <div className="flex items-center gap-3">
            {/* Combine Items Toggle */}
            {combineMode ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">
                  {selectedItemsForCombine.length} selected
                </span>
                <button
                  onClick={handleCombineItems}
                  disabled={selectedItemsForCombine.length < 2}
                  className="px-3 py-1 bg-green-600 text-white rounded text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Combine
                </button>
                <button
                  onClick={() => {
                    setCombineMode(false);
                    setSelectedItemsForCombine([]);
                  }}
                  className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCombineMode(true)}
                className="px-3 py-1 bg-orange-100 text-orange-700 rounded text-sm font-semibold hover:bg-orange-200"
              >
                🔗 Combine Items
              </button>
            )}
            
            {/* Number of People */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">👥</span>
              {editingNumberOfPeople ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="2"
                    value={numberOfPeople}
                    onChange={(e) => setNumberOfPeople(parseInt(e.target.value) || 2)}
                    className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                  />
                  <button
                    onClick={() => setEditingNumberOfPeople(false)}
                    className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                  >
                    ✓
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setEditingNumberOfPeople(true)}
                  className="px-3 py-1 bg-gray-100 text-gray-900 rounded font-semibold text-sm hover:bg-gray-200"
                >
                  {numberOfPeople} ✏️
                </button>
              )}
            </div>
          </div>
        </div>
        
        {combineMode && (
          <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-sm text-orange-800">
              📌 Select 2 or more items to combine them (e.g., main dish + add-ons)
            </p>
          </div>
        )}
        
        <div className="space-y-3">
          {(bill.lineItems || []).map(item => {
            const itemClaims = (claims || []).filter(c => c.itemId === item.id);
            const totalClaimed = itemClaims.reduce((sum, c) => sum + c.percentage, 0);
            const isSelected = selectedItemsForCombine.includes(item.id);
            
            return (
              <div
                key={item.id}
                className={`border rounded-lg p-4 transition-all ${
                  combineMode 
                    ? isSelected 
                      ? 'border-orange-500 bg-orange-50 cursor-pointer' 
                      : 'border-gray-200 hover:border-orange-300 cursor-pointer'
                    : 'border-gray-200'
                }`}
                onClick={combineMode ? () => handleToggleItemSelection(item.id) : undefined}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-start gap-3 flex-1">
                    {combineMode && (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleItemSelection(item.id)}
                        className="mt-1 w-5 h-5 text-orange-600 rounded focus:ring-orange-500"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{item.name}</h3>
                        {item.combinedFrom && item.combinedFrom.length > 1 && (
                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded-full">
                            Combined ({item.combinedFrom.length})
                          </span>
                        )}
                      </div>
                      <p className="text-lg font-bold text-gray-900">${item.price.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Uncombine button for combined items */}
                    {item.combinedFrom && item.combinedFrom.length > 1 && !combineMode && (
                      <button
                        onClick={() => handleUncombineItem(item.id)}
                        className="px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-orange-700 hover:bg-orange-200"
                        title="Split back into original items"
                      >
                        ✂️ Uncombine
                      </button>
                    )}
                    {editingSharedItem === item.id ? (
                      <>
                        <input
                          type="number"
                          min="2"
                          value={sharedCount}
                          onChange={(e) => setSharedCount(parseInt(e.target.value) || 2)}
                          className="w-16 px-2 py-1 border border-gray-300 rounded text-sm"
                          placeholder="2"
                        />
                        <span className="text-xs text-gray-600">people</span>
                        <button
                          onClick={() => handleToggleShared(item.id, sharedCount)}
                          className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditingSharedItem(null)}
                          className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-700"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <>
                        {!item.isShared && (
                          <button
                            onClick={() => handleToggleShared(item.id, numberOfPeople)}
                            className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700 hover:bg-purple-200"
                            title={`Split equally among ${numberOfPeople} people`}
                          >
                            Split for All ({numberOfPeople})
                          </button>
                        )}
                        <button
                          onClick={() => item.isShared ? handleToggleShared(item.id) : handleSetShared(item.id)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            item.isShared
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {item.isShared ? `Shared (${item.sharedAmongCount})` : 'Mark as Shared'}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!item.isShared && (
                  <div className="text-sm text-gray-600">
                    Claimed: {totalClaimed}%
                    {itemClaims.length > 0 && (
                      <span className="ml-2">
                        by {itemClaims.map(c => c.participantName).join(', ')}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
