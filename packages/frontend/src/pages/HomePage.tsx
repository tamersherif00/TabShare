import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50/30">
      {/* Mobile-First Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 py-8 md:py-16">
          {/* Content */}
          <div className="text-center space-y-6 mb-8">
            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
              ✨ No app downloads required
            </div>
            
            <h1 className="text-3xl md:text-5xl font-bold text-gray-900 leading-tight">
              Split bills
              <span className="block text-primary-500">the fair way</span>
            </h1>
            
            <p className="text-lg md:text-xl text-gray-600 leading-relaxed max-w-2xl mx-auto">
              Upload your receipt, share a link, and let everyone claim their items. 
              Tax and tip are split automatically.
            </p>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center mb-8">
            <Button
              onClick={() => navigate('/upload')}
              size="lg"
              className="shadow-lg shadow-primary-500/25"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Start New Bill
            </Button>
            
            <Button
              onClick={() => navigate('/join')}
              variant="outline"
              size="lg"
            >
              Join Existing Bill
            </Button>
          </div>

          {/* Compact Receipt Preview - Mobile Optimized */}
          <div className="max-w-sm mx-auto mb-8">
            <div className="bg-white rounded-2xl shadow-lg p-4">
              <div className="text-center border-b border-gray-200 pb-3 mb-3">
                <h3 className="font-semibold text-gray-900 text-sm">Restaurant Receipt</h3>
                <p className="text-xs text-gray-500">3 guests</p>
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span>🍕 Pizza</span>
                  <span className="font-medium">$18.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>🥗 Salad</span>
                  <span className="font-medium">$12.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>🧃 Juice (2x)</span>
                  <span className="font-medium">$16.00</span>
                </div>
                <div className="border-t border-gray-200 pt-2 mt-2">
                  <div className="flex justify-between font-semibold">
                    <span>Total</span>
                    <span>$59.17</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Trust Indicators */}
          <div className="flex items-center justify-center space-x-6 text-gray-500 text-sm">
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
              <span>Secure</span>
            </div>
            <div className="flex items-center space-x-1">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Free</span>
            </div>
          </div>
        </div>
      </div>

      {/* Compact How It Works */}
      <div className="bg-white py-12">
        <div className="max-w-4xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">How it works</h2>
            <p className="text-gray-600">Three simple steps</p>
          </div>
          
          <div className="space-y-6 md:grid md:grid-cols-3 md:gap-6 md:space-y-0">
            {/* Step 1 */}
            <div className="flex items-start space-x-4 md:flex-col md:items-center md:text-center md:space-x-0">
              <div className="flex-shrink-0 relative">
                <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
              </div>
              <div className="md:mt-4">
                <h3 className="font-semibold text-gray-900 mb-1">Upload Receipt</h3>
                <p className="text-gray-600 text-sm">Take a photo or upload your receipt</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="flex items-start space-x-4 md:flex-col md:items-center md:text-center md:space-x-0">
              <div className="flex-shrink-0 relative">
                <div className="w-12 h-12 bg-success-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-success-500 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
              </div>
              <div className="md:mt-4">
                <h3 className="font-semibold text-gray-900 mb-1">Share Link</h3>
                <p className="text-gray-600 text-sm">Send to your group via text or QR code</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="flex items-start space-x-4 md:flex-col md:items-center md:text-center md:space-x-0">
              <div className="flex-shrink-0 relative">
                <div className="w-12 h-12 bg-warning-100 rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-warning-500 text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
              </div>
              <div className="md:mt-4">
                <h3 className="font-semibold text-gray-900 mb-1">Everyone Claims</h3>
                <p className="text-gray-600 text-sm">Each person selects their items</p>
              </div>
            </div>
          </div>
        </div>
      </div>


    </div>
  );
}
