import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import BillView from '../components/BillView';
import ParticipantSummary from '../components/ParticipantSummary';
import { ErrorMessage } from '../components/ErrorMessage';
import { OfflineIndicator } from '../components/OfflineIndicator';
import { useWebSocket, WebSocketMessage } from '../hooks/useWebSocket';
import { Bill, Claim } from '../types/bill';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper functions for localStorage
const getStoredParticipant = (billId: string) => {
  try {
    const stored = localStorage.getItem(`bill_${billId}_participant`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const storeParticipant = (billId: string, participantId: string, name: string) => {
  try {
    localStorage.setItem(`bill_${billId}_participant`, JSON.stringify({ participantId, name }));
  } catch (err) {
    console.error('Failed to store participant:', err);
  }
};

export default function BillPage() {
  const { billId } = useParams<{ billId: string }>();
  const [searchParams] = useSearchParams();
  
  const [bill, setBill] = useState<Bill | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [participantId, setParticipantId] = useState<string>('');
  const [participantName, setParticipantName] = useState<string>('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState(searchParams.get('name') || '');
  const [isReturningUser, setIsReturningUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [nameError, setNameError] = useState<string>('');

  // Handle WebSocket messages for real-time updates
  const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
    switch (message.type) {
      case 'CLAIM_CREATED':
        setClaims(prev => {
          // Avoid duplicates (from optimistic updates)
          if (prev.some(c => c.id === message.payload.claim.id)) return prev;
          // Also check for temp IDs that might match
          const tempClaim = prev.find(c => 
            c.id.startsWith('temp-') && 
            c.itemId === message.payload.claim.itemId && 
            c.participantId === message.payload.claim.participantId
          );
          if (tempClaim) {
            // Replace temp claim with real one
            return prev.map(c => c.id === tempClaim.id ? message.payload.claim : c);
          }
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
        setBill(prev => prev ? { ...prev, ...message.payload.updates } : null);
        break;
    }
  }, []);

  // WebSocket connection for real-time updates
  const { isConnected } = useWebSocket({
    billId: billId || '',
    userId: participantId,
    onMessage: handleWebSocketMessage,
  });

  useEffect(() => {
    if (!billId) return;
    
    const initializeParticipant = async () => {
      // Check if user has previously joined this bill
      const stored = getStoredParticipant(billId);
      const nameFromUrl = searchParams.get('name');
      
      if (stored) {
        // Returning user - restore their identity
        setParticipantId(stored.participantId);
        setParticipantName(stored.name);
        setNameInput(stored.name);
        setIsReturningUser(true);
        setShowNameModal(false);
      } else if (nameFromUrl) {
        // User with name in URL - register with backend
        setNameInput(nameFromUrl);
        await registerParticipant(nameFromUrl);
      } else {
        // New user - show name modal
        setShowNameModal(true);
      }
      
      await fetchBillData();
    };
    
    initializeParticipant();
  }, [billId, searchParams]);

  const fetchBillData = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch bill from local server
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
        sharedAmongCount: item.sharedAmongCount
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
      
      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load bill:', err);
      setError(err instanceof Error ? err : new Error('Failed to load bill'));
      setIsLoading(false);
    }
  };

  const registerParticipant = async (name: string) => {
    if (!name.trim() || !billId) return;
    
    try {
      // Register participant with backend (or rejoin if name exists)
      const response = await fetch(`${API_BASE_URL}/api/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId,
          name: name.trim()
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        
        // Check if this person is the payer
        if (data.isPayer) {
          // Store payer info
          localStorage.setItem(`bill_${billId}_payer`, JSON.stringify({
            payerId: data.payerId,
            name: data.payerName
          }));
          // Redirect to payer dashboard
          window.location.href = `/bill/${billId}/dashboard`;
          return;
        }
        
        const { participant, isReturning } = data;
        
        // Use the participant ID from backend (existing or new)
        setParticipantId(participant.id);
        setParticipantName(participant.name);
        setShowNameModal(false);
        setIsReturningUser(isReturning);
        
        // Store participant info for future visits
        storeParticipant(billId, participant.id, participant.name);
        
        // Reload claims to get any existing claims for this participant
        await fetchBillData();
      } else {
        const errorData = await response.json();
        setNameError(errorData.error || 'Failed to join bill');
      }
    } catch (err) {
      console.error('Failed to join bill:', err);
      setNameError('Failed to join bill. Please try again.');
    }
  };

  const handleJoinBill = async () => {
    await registerParticipant(nameInput);
  };
  
  const handleChangeName = () => {
    setShowNameModal(true);
  };

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

  if (!bill || !billId) {
    return (
      <>
        <OfflineIndicator isWebSocketConnected={isConnected} />
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">Bill not found</p>
        </div>
      </>
    );
  }

  return (
    <>
      <OfflineIndicator isWebSocketConnected={isConnected} />
      
      {/* Name Entry Modal */}
      {showNameModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {participantName ? 'Change Your Name' : 'Join Bill Split'}
            </h2>
            <p className="text-gray-600 mb-6">
              {participantName 
                ? 'Enter a new name to update your identity'
                : 'Enter your name to start claiming items. If you\'ve joined before, use the same name to rejoin.'}
            </p>
            
            <input
              type="text"
              value={nameInput}
              onChange={(e) => {
                setNameInput(e.target.value);
                setNameError('');
              }}
              onKeyPress={(e) => e.key === 'Enter' && handleJoinBill()}
              placeholder="Your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-2"
              autoFocus
            />
            
            {nameError && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">{nameError}</p>
              </div>
            )}
            
            <div className="flex gap-2">
              {participantName && (
                <button
                  onClick={() => setShowNameModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleJoinBill}
                disabled={!nameInput.trim()}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {participantName ? 'Update Name' : 'Join Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="space-y-6">
        {error && (
          <ErrorMessage
            error={error}
            onRetry={fetchBillData}
            onDismiss={() => setError(null)}
          />
        )}

        <div className="bg-white rounded-lg shadow-sm p-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bill Split</h1>
              <p className="text-gray-600">
                {isReturningUser ? 'Welcome back! ' : ''}Select your items below
              </p>
            </div>
            {participantName && (
              <div className="text-right">
                <p className="text-sm text-gray-600">Joined as</p>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-gray-900">{participantName}</p>
                  <button
                    onClick={handleChangeName}
                    className="text-xs text-blue-600 hover:text-blue-700"
                    title="Change name"
                  >
                    ✏️
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <BillView
              billId={billId}
              bill={bill}
              isPayer={false}
              userId={participantId}
              userName={participantName}
              claims={claims}
              onClaimsChange={setClaims}
            />
          </div>
          
          <div className="lg:col-span-1">
            <div className="sticky top-20">
              <ParticipantSummary
                bill={bill}
                claims={claims}
                participantId={participantId}
                participantName={participantName}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
