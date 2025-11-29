import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import Layout from './components/Layout';

// Lazy load page components for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const JoinBillPage = lazy(() => import('./pages/JoinBillPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const BillPage = lazy(() => import('./pages/BillPage'));
const PayerDashboardPage = lazy(() => import('./pages/PayerDashboardPage'));

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
  </div>
);

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <Layout>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/join" element={<JoinBillPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/bill/:billId" element={<BillPage />} />
              <Route path="/bill/:billId/dashboard" element={<PayerDashboardPage />} />
            </Routes>
          </Suspense>
        </Layout>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
