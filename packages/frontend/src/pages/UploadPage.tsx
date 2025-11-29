import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BillUpload from '../components/BillUpload';

export default function UploadPage() {
  const navigate = useNavigate();
  const [showNameModal, setShowNameModal] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUpload = async (file: File) => {
    // Show name modal before uploading
    setPendingFile(file);
    setShowNameModal(true);
  };

  const handleConfirmUpload = async () => {
    if (!payerName.trim() || !pendingFile) return;
    
    setIsUploading(true);
    
    try {
      const payerId = 'payer-' + Date.now();
      
      // Step 1: Create bill and get presigned S3 URL
      const createResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/bills/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          payerId,
          payerName: payerName.trim(),
          fileType: pendingFile.type,
          fileSize: pendingFile.size,
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create bill');
      }

      const { bill, uploadUrl, receiptKey } = await createResponse.json();

      // Step 2: Upload file directly to S3
      const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': pendingFile.type,
        },
        body: pendingFile,
      });

      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Failed to upload file to S3: ${uploadResponse.status} - ${errorText}`);
      }

      // Step 3: Wait a moment for S3 consistency, then process receipt with Textract
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const processResponse = await fetch(`${import.meta.env.VITE_API_URL}/api/bills/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          billId: bill.id,
          receiptKey,
        }),
      });

      if (processResponse.ok) {
        const processResult = await processResponse.json();
        
        // Check if Textract failed
        if (processResult.textractFailed) {
          alert('Could not automatically extract items from receipt. You can add them manually.');
        }
      }
      
      // Store payer info in localStorage
      localStorage.setItem(`bill_${bill.id}_payer`, JSON.stringify({
        payerId,
        name: payerName.trim()
      }));
      
      // Navigate to payer dashboard
      navigate(`/bill/${bill.id}/dashboard?name=${encodeURIComponent(payerName.trim())}`);
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Upload failed: ' + (error instanceof Error ? error.message : 'Unknown error'));
      setIsUploading(false);
      setShowNameModal(false);
      setPendingFile(null);
      setPayerName('');
    }
  };

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
              As the payer, enter your name to create the bill
            </p>
            
            <input
              type="text"
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmUpload()}
              placeholder="Your name"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
              autoFocus
            />
            
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowNameModal(false);
                  setPendingFile(null);
                }}
                className="flex-1 px-6 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmUpload}
                disabled={!payerName.trim() || isUploading}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploading ? 'Creating...' : 'Create Bill'}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="max-w-2xl mx-auto">
        <BillUpload onUpload={handleUpload} />
      </div>
    </>
  );
}
