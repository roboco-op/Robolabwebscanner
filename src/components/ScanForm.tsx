import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

interface ScanFormProps {
  onScan: (url: string) => void;
  loading: boolean;
}

export function ScanForm({ onScan, loading }: ScanFormProps) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const urlObj = new URL(url);
      if (!urlObj.protocol.startsWith('http')) {
        setError('Please enter a valid HTTP or HTTPS URL');
        return;
      }
      onScan(url);
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)');
    }
  };

  return (
    <div className="w-full max-w-3xl bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-xl shadow-2xl p-8 border-2 border-blue-500">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center shadow-lg">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white">Robo-Lab Analysis Console</h2>
        </div>
        <p className="text-blue-200 text-sm ml-13">
          Run a deep technical scan of any site. Inspect TLS & security headers, performance metrics, accessibility issues, and API behavior with a single click.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className="w-full px-4 py-3 bg-white/90 border-none rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-gray-900 placeholder-gray-500"
            disabled={loading}
          />
          {error && <p className="text-red-300 text-sm mt-2">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-lg"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              Start Deep Scan
            </>
          )}
        </button>
      </form>
    </div>
  );
}
