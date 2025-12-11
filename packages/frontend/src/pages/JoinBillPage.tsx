import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export default function JoinBillPage() {
  const navigate = useNavigate();
  const [billId, setBillId] = useState('');
  const [name, setName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const extractBillId = (input: string): string => {
    // Handle full URLs like https://domain.com/bill/abc123
    const urlMatch = input.match(/\/bill\/([a-zA-Z0-9-]+)/);
    if (urlMatch) {
      return urlMatch[1];
    }
    
    // Handle direct bill IDs
    return input.trim();
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billId.trim() || !name.trim()) return;

    setIsJoining(true);
    
    try {
      const cleanBillId = extractBillId(billId);
      navigate(`/bill/${cleanBillId}?name=${encodeURIComponent(name.trim())}`);
    } catch (error) {
      console.error('Failed to join bill:', error);
      setIsJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-12">
      <div className="max-w-md mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-success-100 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Join a Bill</h1>
          <p className="text-gray-600">Enter your details to join an existing bill split</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Join Bill Split</CardTitle>
          </CardHeader>
          
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-6">
              <Input
                label="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter your name"
                required
              />

              <Input
                label="Bill ID or Share Link"
                value={billId}
                onChange={(e) => setBillId(e.target.value)}
                placeholder="Paste the link or enter bill ID"
                helperText="You can paste the full link shared by the payer"
                required
              />

              <Button
                type="submit"
                size="lg"
                fullWidth
                loading={isJoining}
                disabled={!billId.trim() || !name.trim()}
              >
                {isJoining ? 'Joining...' : 'Join Bill'}
              </Button>
            </form>

            {/* QR Code Section */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-xl mb-3">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <h3 className="font-medium text-gray-900 mb-1">Have a QR Code?</h3>
                <p className="text-sm text-gray-600">
                  Scan the QR code shared by the payer to join instantly
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help Section */}
        <div className="mt-8 text-center">
          <div className="bg-primary-50 rounded-xl p-4">
            <h4 className="font-medium text-primary-900 mb-2">Need Help?</h4>
            <p className="text-sm text-primary-700">
              Ask the person who created the bill to share the link or QR code with you.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
