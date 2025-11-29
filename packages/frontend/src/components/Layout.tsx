import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center space-x-2">
              <span className="text-2xl">🧾</span>
              <h1 className="text-xl font-bold text-gray-900">
                TabShare
              </h1>
            </Link>
            {!isHome && (
              <Link
                to="/"
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                New Bill
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-6 max-w-4xl">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-auto">
        <div className="container mx-auto px-4 py-4 text-center text-sm text-gray-600">
          Bills are automatically deleted after 30 days
        </div>
      </footer>
    </div>
  );
}
