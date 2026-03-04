import { AlertCircle } from 'lucide-react';

export function LegalBanner() {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6" role="region" aria-labelledby="legal-banner-title">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm text-blue-900">
          <p id="legal-banner-title" className="font-medium mb-1">Terms of Service</p>
          <ul className="text-blue-800 list-disc pl-5 space-y-1">
            <li>By submitting a URL, you confirm you own the website or have explicit permission to scan it.</li>
            <li>Scans are automated, read-only, and respect publicly available crawling rules with domain-level throttling.</li>
            <li>You agree not to use this service for unlawful, abusive, or unauthorized testing.</li>
            <li>Results are stored for up to 30 days unless you opt in for extended retention; PII in URLs is redacted where reasonably possible.</li>
            <li>This service is provided “as is” without warranties, and we are not liable for any damages arising from its use.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
