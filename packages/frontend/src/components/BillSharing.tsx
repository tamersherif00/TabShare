import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

interface BillSharingProps {
  billId: string;
  shareUrl: string;
}

export default function BillSharing({ billId, shareUrl }: BillSharingProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleWhatsAppShare = () => {
    const message = encodeURIComponent(`Join my bill split: ${shareUrl}`);
    const whatsappUrl = `https://wa.me/?text=${message}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleSMSShare = () => {
    const message = encodeURIComponent(`Join my bill split: ${shareUrl}`);
    const smsUrl = `sms:?body=${message}`;
    window.location.href = smsUrl;
  };

  const handleEmailShare = () => {
    const subject = encodeURIComponent('Join My Bill Split');
    const body = encodeURIComponent(
      `Hi! I've created a bill split for our meal.\n\nClick here to join and claim your items:\n${shareUrl}\n\nOr scan the QR code I'll show you.`
    );
    const emailUrl = `mailto:?subject=${subject}&body=${body}`;
    window.location.href = emailUrl;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Share Your Bill
        </h2>
        <p className="text-gray-600">
          Share this link or QR code with your group
        </p>
      </div>

      {/* QR Code */}
      <div className="flex justify-center p-6 bg-gray-50 rounded-lg">
        <QRCodeSVG
          value={shareUrl}
          size={200}
          level="M"
          includeMargin={true}
        />
      </div>

      {/* Share URL */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Share Link
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={shareUrl}
            readOnly
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm"
          />
          <button
            onClick={handleCopyLink}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
        {copied && (
          <p className="text-sm text-green-600 animate-fade-in">
            Link copied to clipboard!
          </p>
        )}
      </div>

      {/* Social Share Buttons */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">
          Or share via:
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* WhatsApp */}
          <button
            onClick={handleWhatsAppShare}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-green-500 text-white rounded-lg font-semibold hover:bg-green-600 transition-colors"
          >
            <span className="text-xl">💬</span>
            <span>WhatsApp</span>
          </button>

          {/* SMS */}
          <button
            onClick={handleSMSShare}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 transition-colors"
          >
            <span className="text-xl">💬</span>
            <span>SMS</span>
          </button>

          {/* Email */}
          <button
            onClick={handleEmailShare}
            className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-600 text-white rounded-lg font-semibold hover:bg-gray-700 transition-colors"
          >
            <span className="text-xl">✉️</span>
            <span>Email</span>
          </button>
        </div>
      </div>

      {/* Bill ID Reference */}
      <div className="pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          Bill ID: <span className="font-mono">{billId}</span>
        </p>
      </div>
    </div>
  );
}
