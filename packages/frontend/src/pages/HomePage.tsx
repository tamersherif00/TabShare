import { useNavigate } from 'react-router-dom';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div className="text-center space-y-4">
        <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
          Split Bills Fairly
        </h2>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Upload a receipt, share with your group, and let everyone claim their items.
          Tax, tip, and fees are automatically distributed.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={() => navigate('/upload')}
          className="px-8 py-4 bg-blue-600 text-white rounded-lg font-semibold text-lg hover:bg-blue-700 transition-colors shadow-md"
        >
          Create New Bill
        </button>
        <button
          onClick={() => navigate('/join')}
          className="px-8 py-4 bg-white text-gray-900 border-2 border-gray-300 rounded-lg font-semibold text-lg hover:border-gray-400 transition-colors"
        >
          Join Existing Bill
        </button>
      </div>

      {/* Features */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="text-3xl mb-3">📸</div>
          <h3 className="font-semibold text-lg mb-2">Snap & Upload</h3>
          <p className="text-gray-600 text-sm">
            Take a photo of your receipt or upload from your gallery
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="text-3xl mb-3">🔗</div>
          <h3 className="font-semibold text-lg mb-2">Share Instantly</h3>
          <p className="text-gray-600 text-sm">
            Generate a QR code or share link via WhatsApp, SMS, or email
          </p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow-sm">
          <div className="text-3xl mb-3">⚡</div>
          <h3 className="font-semibold text-lg mb-2">Real-Time Updates</h3>
          <p className="text-gray-600 text-sm">
            See everyone's claims update live as they select their items
          </p>
        </div>
      </div>
    </div>
  );
}
