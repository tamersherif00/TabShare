import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import PayerDashboard from '../components/PayerDashboard';
import BillView from '../components/BillView';
import ParticipantSummary from '../components/ParticipantSummary';
import { useWebSocket } from '../hooks/useWebSocket';
import { Bill, Claim } from '../types/bill';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper functions for localStorage
const getStoredPayer = (billId: string) => {
  try {
    const stored = localStorage.getItem(`bill_${billId}_payer`);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

const storePayer = (billId: string, payerId: string, name: string) => {
  try {
    localStorage.setItem(`bill_${billId}_payer`, JSON.stringify({ payerId, name }));
  } catch (err) {
    console.error('Failed to store payer:', err);
  }
};

export default function PayerDashboardPage() {
  const { billId } = useParams<{ billId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [payerId, setPayerId] = useState<string>('');
  const [payerName, setPayerName] = useState<string>('');
  const [showNameModal, setShowNameModal] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isReady, setIsReady] = useState(false);
  
  // Get active tab from URL or default to 'claim'
  const tabFromUrl = searchParams.get('tab') as 'claim' | 'manage' | null;
  const [activeTab, setActiveTab] = useState<'claim' | 'manage'>(tabFromUrl || 'claim');
  
  // Sync activeTab with URL changes
  useEffect(() => {
    const tab = searchParams.get('tab') as 'claim' | 'manage' | null;
    if (tab) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!billId) return;

    // Check if payer has previously accessed this bill
    const stored = getStoredPayer(billId);
    const nameFromUrl = searchParams.get('name');

    if (stored) {
      // Returning payer - restore their identity
      setPayerId(stored.payerId);
      setPayerName(stored.name);
      setIsReady(true);
    } else if (nameFromUrl) {
      // New payer with name in URL (from upload)
      const newPayerId = 'payer-' + Date.now();
      setPayerId(newPayerId);
      setPayerName(nameFromUrl);
      storePayer(billId, newPayerId, nameFromUrl);
      setIsReady(true);
    } else {
      // No stored data or URL name - show modal
      setShowNameModal(true);
    }
  }, [billId, searchParams]);

  const handleSetName = () => {
    if (!nameInput.trim() || !billId) return;

    const newPayerId = 'payer-' + Date.now();
    setPayerId(newPayerId);
    setPayerName(nameInput.trim());
    storePayer(billId, newPayerId, nameInput.trim());
    setShowNameModal(false);
    setIsReady(true);
    
    // Update URL to include name
    navigate(`/bill/${billId}/dashboard?name=${encodeURIComponent(nameInput.trim())}`, { replace: true });
  };

  if (!billId) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700">Bill ID is required</p>
      </div>
    );
  }

  if (!isReady) {
    return (
      <>
        {/* Name Entry Modal */}
        {showNameModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                Enter Your Name
              </h2>
              <p className="text-gray-600 mb-6">
                As the payer, enter your name to access the dashboard
              </p>
              
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetName()}
                placeholder="Your name"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
                autoFocus
              />
              
              <button
                onClick={handleSetName}
                disabled={!nameInput.trim()}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Access Dashboard
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with tabs */}
      <div className="bg-white rounded-lg shadow-sm p-4">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payer Dashboard</h1>
            <p className="text-gray-600">
              {payerName ? `Payer: ${payerName}` : 'Manage your bill'}
            </p>
          </div>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => {
              setActiveTab('claim');
              navigate(`/bill/${billId}/dashboard?tab=claim${payerName ? `&name=${encodeURIComponent(payerName)}` : ''}`, { replace: true });
            }}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'claim'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            My Items
          </button>
          <button
            onClick={() => {
              setActiveTab('manage');
              navigate(`/bill/${billId}/dashboard?tab=manage${payerName ? `&name=${encodeURIComponent(payerName)}` : ''}`, { replace: true });
            }}
            className={`px-4 py-2 font-medium transition-colors ${
              activeTab === 'manage'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Manage Bill
          </button>
        </div>
      </div>

      {/* Content based on active tab */}
      {activeTab === 'claim' ? (
        <PayerClaimView billId={billId} payerId={payerId} payerName={payerName} />
      ) : (
        <PayerDashboard billId={billId} payerId={payerId} payerName={payerName} />
      )}
    </div>
  );
}

// Component for payer to claim items
function PayerClaimView({ billId, payerId, payerName }: { billId: string; payerId: string; payerName?: string }) {
  const [bill, setBill] = useState<Bill | null>(null);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [_error, setError] = useState<Error | null>(null);

  const { isConnected } = useWebSocket({
    billId,
    userId: payerId,
    onMessage: (message) => {
      switch (message.type) {
        case 'CLAIM_CREATED':
          setClaims(prev => [...(prev || []), message.payload.claim]);
          break;
        case 'CLAIM_UPDATED':
          setClaims(prev =>
            (prev || []).map(c => c.id === message.payload.claim.id ? message.payload.claim : c)
          );
          break;
        case 'CLAIM_DELETED':
          setClaims(prev => (prev || []).filter(c => c.id !== message.payload.claimId));
          break;
        case 'BILL_UPDATED':
          setBill(prev => prev ? { ...prev, ...message.payload.updates } : null);
          break;
      }
    },
  });

  useEffect(() => {
    fetchBillData();
  }, [billId]);

  async function fetchBillData(retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1500;
    
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
        sharedAmongCount: item.sharedAmongCount
      }));
      
      // If bill is still pending or has no items, retry after delay
      if ((data.bill.status === 'pending' || lineItems.length === 0) && retryCount < MAX_RETRIES) {
        setTimeout(() => fetchBillData(retryCount + 1), RETRY_DELAY);
        return;
      }
      
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
  }

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

  if (!bill) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700">Bill not found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <BillView
          billId={billId}
          bill={bill}
          isPayer={true}
          userId={payerId}
          userName={payerName || 'Payer'}
          claims={claims}
          onClaimsChange={setClaims}
        />
      </div>
      
      <div className="lg:col-span-1">
        <div className="sticky top-20">
          <ParticipantSummary
            bill={bill}
            claims={claims}
            participantId={payerId}
            participantName={payerName || 'Payer'}
          />
        </div>
      </div>
    </div>
  );
}
