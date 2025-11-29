import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function JoinBillPage() {
  const navigate = useNavigate();
  const [billId, setBillId] = useState('');
  const [name, setName] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (billId && name) {
      // Navigate to bill view with participant info
      navigate(`/bill/${billId}?name=${encodeURIComponent(name)}`);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow-md p-6 md:p-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          Join a Bill
        </h2>
        
        <form onSubmit={handleJoin} className="space-y-4">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Your Name
            </label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label htmlFor="billId" className="block text-sm font-medium text-gray-700 mb-1">
              Bill ID or Share Link
            </label>
            <input
              type="text"
              id="billId"
              value={billId}
              onChange={(e) => setBillId(e.target.value)}
              placeholder="Enter bill ID or paste link"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Join Bill
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            Or scan the QR code shared by the payer
          </p>
        </div>
      </div>
    </div>
  );
}
