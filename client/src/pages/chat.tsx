import { ChatWidget } from "@/components/chat-widget";

export function ChatPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header for standalone chat page */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10">
                <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <rect width="32" height="32" rx="16" fill="#22c55e"/>
                  <path d="M8 12h16v8H8z" fill="white" fillOpacity="0.9"/>
                  <circle cx="12" cy="16" r="2" fill="#22c55e"/>
                  <circle cx="20" cy="16" r="2" fill="#22c55e"/>
                  <path d="M10 20h12v2H10z" fill="white" fillOpacity="0.8"/>
                  <text x="16" y="11" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">SACCO</text>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">SOYOSOYO SACCO</h1>
                <p className="text-sm text-gray-600">Assistant Chat</p>
              </div>
            </div>
            <a 
              href="http://soyosoyosacco.com" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-green-600 hover:text-green-800 text-sm font-medium"
            >
              Visit soyosoyosacco.com
            </a>
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Welcome to SOYOSOYO SACCO Assistant
          </h2>
          <p className="text-lg text-gray-600 mb-8 max-w-2xl">
            Get instant help with your SACCO needs. Ask about loans, savings products, 
            membership requirements, and our services. Click the green chat button to start!
          </p>
          
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Loan Services</h3>
              <p className="text-gray-600">Ask about loan products, requirements, interest rates, and application processes.</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Savings Products</h3>
              <p className="text-gray-600">Learn about our savings accounts, fixed deposits, and investment options.</p>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-md">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Membership</h3>
              <p className="text-gray-600">Get information about joining SOYOSOYO SACCO and membership benefits.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Chat Widget */}
      <ChatWidget />
    </div>
  );
}