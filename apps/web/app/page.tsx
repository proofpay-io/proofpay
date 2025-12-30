'use client';

import { useState } from 'react';

export default function Home() {
  const [apiResponse, setApiResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const callHealthEndpoint = async () => {
    setLoading(true);
    setApiResponse(null);
    
    try {
      const response = await fetch('http://localhost:4000/health');
      const data = await response.json();
      setApiResponse(JSON.stringify(data, null, 2));
    } catch (error) {
      setApiResponse(`Error: ${error instanceof Error ? error.message : 'Failed to fetch'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-2xl w-full space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-6xl font-bold text-gray-900 mb-4">
            ProofPay
          </h1>
          <p className="text-xl text-gray-600">
            Turns Payments Into Proofs Of Purchase
          </p>
        </div>

        <div className="flex flex-col items-center space-y-4">
          <button
            onClick={callHealthEndpoint}
            disabled={loading}
            className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Calling API...' : 'Check API Health'}
          </button>

          {apiResponse && (
            <div className="w-full mt-6 p-4 bg-white rounded-lg shadow-md">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">API Response:</h2>
              <pre className="text-sm text-gray-800 bg-gray-50 p-4 rounded border overflow-x-auto">
                {apiResponse}
              </pre>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

