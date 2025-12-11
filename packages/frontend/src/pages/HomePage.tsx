import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';

export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-primary-50/30">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 py-16 lg:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Content */}
            <div className="space-y-8">
              <div className="space-y-4">
                <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
                  ✨ No app downloads required
                </div>
                
                <h1 className="text-4xl lg:text-6xl font-bold text-gray-900 leading-tight">
                  Split bills
                  <span className="block text-primary-500">the fair way</span>
                </h1>
                
                <p className="text-xl text-gray-600 leading-relaxed max-w-lg">
                  Upload your receipt, share a link, and let everyone claim their items. 
                  Tax and tip are split automatically.
                </p>
              </div>

              {/* Primary Actions */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  onClick={() => navigate('/upload')}
                  size="xl"
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
                  size="xl"
                >
                  Join Existing Bill
                </Button>
              </div>

              {/* Quick Stats */}
              <div className="flex items-center space-x-6 pt-4">
                <div className="flex items-center space-x-2 text-gray-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm">Secure & Private</span>
                </div>
                <div className="flex items-center space-x-2 text-gray-500">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm">Always Free</span>
                </div>
              </div>
            </div>

            {/* Right Column - Visual */}
            <div className="relative">
              <div className="relative bg-white rounded-3xl shadow-2xl shadow-gray-900/10 p-8 transform rotate-2 hover:rotate-0 transition-transform duration-500">
                {/* Mock Receipt */}
                <div className="space-y-4">
                  <div className="text-center border-b border-gray-200 pb-4">
                    <h3 className="font-bold text-gray-900">Restaurant Receipt</h3>
                    <p className="text-sm text-gray-500">Table 4 • 3 guests</p>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center p-2 rounded-lg bg-primary-50 border border-primary-200">
                      <span className="text-sm">🍕 Margherita Pizza</span>
                      <span className="font-medium">$18.00</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded-lg bg-success-50 border border-success-200">
                      <span className="text-sm">🥗 Caesar Salad</span>
                      <span className="font-medium">$12.00</span>
                    </div>
                    <div className="flex justify-between items-center p-2 rounded-lg bg-warning-50 border border-warning-200">
                      <span className="text-sm">🧃 Orange Juice (2x)</span>
                      <span className="font-medium">$16.00</span>
                    </div>
                  </div>
                  
                  <div className="border-t border-gray-200 pt-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Subtotal</span>
                      <span>$46.00</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Tax</span>
                      <span>$4.14</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Tip (18%)</span>
                      <span>$9.03</span>
                    </div>
                    <div className="flex justify-between font-bold text-lg border-t border-gray-200 pt-2">
                      <span>Total</span>
                      <span>$59.17</span>
                    </div>
                  </div>
                </div>
                
                {/* Floating Elements */}
                <div className="absolute -top-4 -right-4 bg-primary-500 text-white rounded-full p-3 shadow-lg">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works - Simplified */}
      <div className="bg-white py-16">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">How it works</h2>
            <p className="text-gray-600 text-lg">Three simple steps to fair bill splitting</p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center group">
              <div className="relative mb-6">
                <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto group-hover:bg-primary-200 transition-colors">
                  <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-primary-500 text-white rounded-full flex items-center justify-center text-sm font-bold">1</div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Upload Receipt</h3>
              <p className="text-gray-600 text-sm">Take a photo or upload your receipt. Our AI extracts all items automatically.</p>
            </div>

            {/* Step 2 */}
            <div className="text-center group">
              <div className="relative mb-6">
                <div className="w-16 h-16 bg-success-100 rounded-2xl flex items-center justify-center mx-auto group-hover:bg-success-200 transition-colors">
                  <svg className="w-8 h-8 text-success-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-success-500 text-white rounded-full flex items-center justify-center text-sm font-bold">2</div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Share Link</h3>
              <p className="text-gray-600 text-sm">Send the link to your group via text, email, or QR code. No app required.</p>
            </div>

            {/* Step 3 */}
            <div className="text-center group">
              <div className="relative mb-6">
                <div className="w-16 h-16 bg-warning-100 rounded-2xl flex items-center justify-center mx-auto group-hover:bg-warning-200 transition-colors">
                  <svg className="w-8 h-8 text-warning-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 bg-warning-500 text-white rounded-full flex items-center justify-center text-sm font-bold">3</div>
              </div>
              <h3 className="font-semibold text-lg mb-2">Everyone Claims</h3>
              <p className="text-gray-600 text-sm">Each person selects their items. Tax and tip are automatically distributed fairly.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Social Proof */}
      <div className="bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4 text-center">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 items-center opacity-60">
            <div className="flex items-center justify-center space-x-2">
              <div className="w-8 h-8 bg-primary-500 rounded-lg"></div>
              <span className="font-medium text-gray-700">Trusted</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-8 h-8 bg-success-500 rounded-lg"></div>
              <span className="font-medium text-gray-700">Secure</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-8 h-8 bg-warning-500 rounded-lg"></div>
              <span className="font-medium text-gray-700">Fast</span>
            </div>
            <div className="flex items-center justify-center space-x-2">
              <div className="w-8 h-8 bg-gray-500 rounded-lg"></div>
              <span className="font-medium text-gray-700">Free</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
