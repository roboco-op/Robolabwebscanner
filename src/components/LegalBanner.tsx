import { AlertCircle } from 'lucide-react';

export function LegalBanner() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium mb-1">Terms of Service</p>
          <p className="text-blue-800">
            By submitting a URL, you confirm you have permission to scan this website.
            We perform non-intrusive, read-only analysis respecting robots.txt.
            Scans are throttled per domain. Results stored for 30 days unless opted in.
            PII in URLs will be redacted.
          </p>
        </div>
      </div>
    </div>
  );
}
