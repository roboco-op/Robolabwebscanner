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
          <h1 className="text-2xl font-bold text-white">Robo-Lab Analysis Console</h1>
        </div>
        <p className="text-blue-200 text-sm ml-13">
          Run a deep technical scan of any site. Inspect TLS & security headers, performance metrics, accessibility issues, and API behavior with a single click.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" aria-label="Website URL scan form">
        <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4 border border-white/20">
          <label htmlFor="url-input" className="block text-sm font-medium text-blue-100 mb-2">
            Website URL <span aria-label="required">*</span>
          </label>
          <input
            id="url-input"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url && !loading) {
                handleSubmit(e as any);
              }
            }}
            placeholder="https://example.com"
            className="w-full px-4 py-3 bg-white/90 border-none rounded-lg focus:ring-2 focus:ring-blue-400 outline-none text-gray-900 placeholder-gray-500"
            disabled={loading}
            required
            aria-required="true"
            aria-label="Website URL to scan"
            aria-describedby={error ? "url-error" : undefined}
          />
          {error && (
            <p id="url-error" className="text-red-300 text-sm mt-2" role="alert">
              {error}
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !loading && url) {
              handleSubmit(e as any);
            }
          }}
          className="w-full px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-900"
          aria-label={loading ? 'Scanning website' : 'Start deep website scan'}
          aria-busy={loading ? "true" : "false"}
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
