import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BillUpload from '../components/BillUpload';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';

export default function UploadPage() {
  const navigate = useNavigate();
  const [showNameModal, setShowNameModal] = useState(false);
  const [payerName, setPayerName] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [nameError, setNameError] = useState('');

  const handleUpload = async (file: File) => {
    setPendingFile(file);
    setShowNameModal(true);
  };

  const handleConfirmUpload = async () => {
    if (!payerName.trim() || !pendingFile) return;
    
    setIsUploading(true);
    setNameError('');
    
    try {
      const payerId = 'payer-' + Date.now();
      
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
        
        if (processResult.textractFailed) {
          // We'll show a toast notification instead of alert
          console.warn('Textract failed - manual entry will be needed');
        }
      }
      
      localStorage.setItem(`bill_${bill.id}_payer`, JSON.stringify({
        payerId,
        name: payerName.trim()
      }));
      
      navigate(`/bill/${bill.id}/dashboard?name=${encodeURIComponent(payerName.trim())}`);
    } catch (error) {
      console.error('Upload failed:', error);
      setNameError(error instanceof Error ? error.message : 'Upload failed. Please try again.');
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setShowNameModal(false);
    setPendingFile(null);
    setPayerName('');
    setNameError('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8">
      <div className="max-w-4xl mx-auto px-4">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Create New Bill</h1>
          <p className="text-gray-600">Upload your receipt to get started</p>
        </div>

        <BillUpload onUpload={handleUpload} />

        {/* Name Entry Modal */}
        {showNameModal && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <Card className="max-w-md w-full">
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="inline-flex items-center justify-center w-10 h-10 bg-primary-100 rounded-xl">
                    <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  Enter Your Name
                </CardTitle>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <p className="text-gray-600">
                  As the payer, enter your name to create the bill and manage the split.
                </p>
                
                <Input
                  value={payerName}
                  onChange={(e) => {
                    setPayerName(e.target.value);
                    setNameError('');
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && !isUploading && payerName.trim() && handleConfirmUpload()}
                  placeholder="Your name"
                  error={!!nameError}
                  helperText={nameError}
                  autoFocus
                />
                
                <div className="flex gap-3">
                  <Button
                    onClick={handleCancel}
                    variant="secondary"
                    size="lg"
                    className="flex-1"
                    disabled={isUploading}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmUpload}
                    disabled={!payerName.trim() || isUploading}
                    loading={isUploading}
                    size="lg"
                    className="flex-1"
                  >
                    {isUploading ? 'Creating Bill...' : 'Create Bill'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
