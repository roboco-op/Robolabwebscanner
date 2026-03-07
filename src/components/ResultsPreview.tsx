import { useEffect, useState } from 'react';
import { Shield, Zap, Eye, AlertTriangle, Mail, Loader2, CheckCircle, Lock, BarChart3, Calendar } from 'lucide-react';
import type { ScanResult } from '../types/scan';

interface ResultsPreviewProps {
  result: ScanResult;
  onEmailSubmit: (email: string, optIn: boolean) => Promise<void>;
  onScanAnother: () => void;
}

export default function ResultsPreview({ result, onEmailSubmit, onScanAnother }: ResultsPreviewProps) {
  const [email, setEmail] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  
  // parseAISummary was removed because it's unused; parse AI summary on demand if needed
  
  // Removed unused `initialParsed`; parse AI summary on demand if needed

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setSubmitting(true);
    try {
      await onEmailSubmit(email, optIn);
      setSubmitted(true);
    } catch (e) {
      console.error(e);
      if (e instanceof Error && e.message) {
        setError(e.message);
      } else {
        setError('Failed to send report. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const isScanning = result.scan_status === 'pending' || result.scan_status === 'processing';
  const apiFailed = !isScanning && result.api_results?.status === 'failed';
  const e2eFailed = !isScanning && result.e2e_results?.status === 'failed';
  const securityIssuesCount = result.security_results?.issues?.length ?? 0;
  const securityScore = result.security_checks_total
    ? Math.round(((result.security_checks_passed ?? 0) / result.security_checks_total) * 100)
    : 0;
  const seoMissingTags = result.seo_results?.missing_meta_tags ?? [];
  const sitemapDetected = result.seo_results?.sitemap_detected;
  const structuredDataMissing = result.seo_results?.structured_data_missing;
  const scanDurationSeconds = result.scan_duration_ms ? Math.max(1, Math.round(result.scan_duration_ms / 1000)) : undefined;
  const previewImageUrl = !isScanning && !previewImageFailed ? result.og_image : null;
  const previewImageSource = result.preview_image_source && result.preview_image_source !== 'none'
    ? result.preview_image_source
    : null;
  const analysisExplanations = result.analysis_explanations || {};

  useEffect(() => {
    setPreviewImageFailed(false);
  }, [result.id, result.og_image]);

  const MetricSkeletonLoader = () => (
    <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-gray-300">
      <div className="flex items-center justify-between mb-2">
        <div className="w-8 h-8 bg-gray-300 rounded animate-pulse" />
        <div className="w-16 h-10 bg-gray-300 rounded animate-pulse" />
      </div>
      <div className="h-4 bg-gray-300 rounded w-20 animate-pulse mb-2" />
      <div className="h-3 bg-gray-200 rounded w-32 animate-pulse" />
    </div>
  );

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'border-red-600 bg-red-50';
      case 'high':
        return 'border-orange-500 bg-orange-50';
      case 'medium':
        return 'border-yellow-400 bg-yellow-50';
      default:
        return 'border-gray-300 bg-gray-50';
    }
  };

  const getCategoryIcon = (category: string) => {
    const c = category.toLowerCase();
    if (c.includes('security')) return <Shield className="w-5 h-5 text-red-600" />;
    if (c.includes('performance')) return <Zap className="w-5 h-5 text-green-600" />;
    if (c.includes('access')) return <Eye className="w-5 h-5 text-orange-600" />;
    return <AlertTriangle className="w-5 h-5 text-gray-600" />;
  };
  return (
    <>
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan Results</h2>
          <p className="text-gray-600">Detailed technical analysis of your website</p>
        </div>

      {!isScanning && (
        <div className="mb-8 bg-gray-50 rounded-lg border border-gray-200 p-5">
          <h3 className="text-lg font-bold text-gray-900 mb-3">Website Preview</h3>
          {previewImageUrl ? (
            <img
              src={previewImageUrl}
              alt={`Preview for ${result.target_url}`}
              className="w-full max-h-64 object-cover rounded-lg border border-gray-200"
              onError={() => setPreviewImageFailed(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-40 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-sm text-gray-500 text-center px-4">
              No preview image available for this page.
            </div>
          )}
          {previewImageSource && (
            <p className="mt-2 text-xs text-gray-500">Source: {previewImageSource}</p>
          )}
        </div>
      )}

      {!isScanning && (
        <div className="mb-8 bg-blue-50 rounded-lg border border-blue-200 p-5">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Overall Explanation</h3>
          <p className="text-sm text-gray-700">
            {analysisExplanations.overall || 'Overall analysis explanation is not available yet for this scan.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-8">
        {isScanning ? (
          <>
            <MetricSkeletonLoader />
            <MetricSkeletonLoader />
            <MetricSkeletonLoader />
            <MetricSkeletonLoader />
            <MetricSkeletonLoader />
            <MetricSkeletonLoader />
          </>
        ) : (
          <>
            <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-red-500">
              <div className="flex items-center justify-between mb-2">
                <Shield className="w-8 h-8 text-red-600" />
                <span className="text-3xl font-bold text-gray-900">
                  {result.security_checks_passed !== undefined ? `${result.security_checks_passed}/${result.security_checks_total || 7}` : (result.scan_status === 'pending' || result.scan_status === 'processing') ? '—' : '0/7'}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-600">Security</p>
              <p className="text-xs text-gray-500 mt-1">Basic security scan completed</p>
            </div>

            <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-green-500">
              <div className="flex items-center justify-between mb-2">
                <Zap className="w-8 h-8 text-green-600" />
                <span className="text-3xl font-bold text-gray-900">
                  {result.performance_score ?? result.performance_results?.score ?? 0}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-600">Performance</p>
              <p className="text-xs text-gray-500 mt-1">Lighthouse Mobile Score</p>
            </div>

            <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-orange-500">
              <div className="flex items-center justify-between mb-2">
                <Eye className="w-8 h-8 text-orange-600" />
                <span className="text-3xl font-bold text-gray-900">
                  {result.accessibility_issue_count ?? result.accessibility_results?.total_issues ?? 0}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-600">Accessibility</p>
              <p className="text-xs text-gray-500 mt-1">Critical & serious issues</p>
            </div>

            <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-cyan-500">
              <div className="flex items-center justify-between mb-2">
                <BarChart3 className="w-8 h-8 text-cyan-600" />
                <span className="text-3xl font-bold text-gray-900">
                  {result.api_results?.endpoints_detected ?? (result.scan_status === 'pending' || result.scan_status === 'processing' ? '—' : 0)}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-600">API Analysis</p>
              <p className="text-xs text-gray-500 mt-1">Endpoints detected</p>
            </div>

            <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-purple-500">
              <div className="flex items-center justify-between mb-2">
                <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11-4-5 2m0 0l5 5m-5-5v5m0 0H4m0 0v4" />
                </svg>
                <span className="text-3xl font-bold text-gray-900">
                  {result.e2e_results && (result.e2e_results.buttons_found !== undefined || result.e2e_results.links_found !== undefined || result.e2e_results.forms_found !== undefined) ? (result.e2e_results.buttons_found || 0) + (result.e2e_results.links_found || 0) + (result.e2e_results.forms_found || 0) : (result.scan_status === 'pending' || result.scan_status === 'processing') ? '—' : 0}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-600">E2E Testing</p>
              <p className="text-xs text-gray-500 mt-1">Interactive elements</p>
            </div>

            <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-indigo-500">
              <div className="flex items-center justify-between mb-2">
                <BarChart3 className="w-8 h-8 text-indigo-600" />
                <span className="text-3xl font-bold text-gray-900">
                  {result.yslow_score ?? (isScanning ? '—' : 0)}
                </span>
              </div>
              <p className="text-sm font-medium text-gray-600">YSlow</p>
              <p className="text-xs text-gray-500 mt-1">Compatibility score</p>
            </div>
          </>
        )}
      </div>

      {(apiFailed || e2eFailed) && (
        <div className="mb-8 space-y-3">
          {apiFailed && (
            <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-4">
              <p className="text-sm font-semibold text-cyan-900">API Analysis incomplete</p>
              <p className="text-sm text-cyan-800 mt-1">
                {result.api_results?.error || 'The passive endpoint analysis could not complete for this scan.'}
              </p>
            </div>
          )}
          {e2eFailed && (
            <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
              <p className="text-sm font-semibold text-purple-900">E2E analysis incomplete</p>
              <p className="text-sm text-purple-800 mt-1">
                {result.e2e_results?.error || 'The interaction analysis could not complete for this scan.'}
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-red-50 rounded-lg p-6 mb-8 border border-red-200">
        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-red-600" />
          Security
        </h3>
        <div className="text-sm text-gray-700 space-y-2">
          <p>{analysisExplanations.security || 'Security analysis explanation is not available yet for this scan.'}</p>
          <p>
            <span className="font-medium">Basic security scan completed:</span> {securityIssuesCount === 0 ? 'No security issues detected.' : `${securityIssuesCount} security issues detected.`}
          </p>
          <p>
            <span className="font-medium">Security score:</span> {securityScore}/100
          </p>
        </div>
      </div>

      {result.performance_results?.core_web_vitals && result.performance_results?.source === 'google-pagespeed' && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 mb-8 border border-green-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Performance Result</h3>
              <p className="text-xs text-gray-600">Core Web Vitals and detailed performance analysis</p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
            <div className="text-sm text-gray-700 space-y-1">
              <p>{analysisExplanations.performance || 'Performance analysis explanation is not available yet for this scan.'}</p>
              <p><span className="font-medium">YSlow-style optimization explanation:</span> {analysisExplanations.yslow || 'YSlow-style explanation is not available yet for this scan.'}</p>
              <p>LCP: {result.performance_results?.core_web_vitals?.lcp ?? 'N/A'} ms</p>
              <p>CLS: {result.performance_results?.core_web_vitals?.cls ?? 'N/A'}</p>
              <p>TTFB: N/A (not collected by current scanner)</p>
            </div>
          </div>
        </div>
      )}

      {result.performance_results?.lighthouse_scores && result.performance_results?.source === 'google-pagespeed' && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 mb-8 border border-blue-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Overall Accessibility Result
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
              <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.performance ?? 0)}`}>
                {result.performance_results?.lighthouse_scores?.performance ?? 0}
              </div>
              <div className="text-sm font-medium text-gray-600 mt-2">Performance</div>
            </div>
            {result.performance_results?.lighthouse_scores?.accessibility && (
              <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
                <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.accessibility ?? 0)}`}>
                  {result.performance_results?.lighthouse_scores?.accessibility ?? 0}
                </div>
                <div className="text-sm font-medium text-gray-600 mt-2">Accessibility</div>
              </div>
            )}
            {result.performance_results?.lighthouse_scores?.bestPractices && (
              <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
                <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.bestPractices ?? 0)}`}>
                  {result.performance_results?.lighthouse_scores?.bestPractices ?? 0}
                </div>
                <div className="text-sm font-medium text-gray-600 mt-2">Best Practices</div>
              </div>
            )}
            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
              <div className={`text-3xl font-bold ${getScoreColor(result.performance_results?.lighthouse_scores?.seo ?? 0)}`}>
                {result.performance_results?.lighthouse_scores?.seo ?? 0}
              </div>
              <div className="text-sm font-medium text-gray-600 mt-2">SEO</div>
            </div>
          </div>
          <div className="mt-4 bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-sm text-gray-700 space-y-1">
            <p><span className="font-medium">Accessibility explanation:</span> {analysisExplanations.accessibility || 'Accessibility analysis explanation is not available yet for this scan.'}</p>
            <p><span className="font-medium">SEO explanation:</span> {analysisExplanations.seo || 'SEO analysis explanation is not available yet for this scan.'}</p>
            <p><span className="font-medium">SEO score explanation:</span> {result.seo_score ?? result.performance_results?.lighthouse_scores?.seo ?? 0}/100</p>
            <p>Missing meta tags: {seoMissingTags.length > 0 ? seoMissingTags.join(', ') : 'None detected'}</p>
            <p>Sitemap detected: {sitemapDetected === undefined ? 'Unknown' : sitemapDetected ? 'Yes' : 'No'}</p>
            <p>Missing structured data: {structuredDataMissing === undefined ? 'Unknown' : structuredDataMissing ? 'Yes' : 'No'}</p>
          </div>
        </div>
      )}

      <div className="bg-cyan-50 rounded-lg p-6 mb-8 border border-cyan-200">
        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-cyan-600" />
          API Analysis Result
        </h3>
        <div className="text-sm text-gray-700 space-y-2">
          <p>{analysisExplanations.api || 'API analysis explanation is not available yet for this scan.'}</p>
          <p><span className="font-medium">Status:</span> {result.api_results?.status || 'N/A'}</p>
          <p><span className="font-medium">Endpoints detected:</span> {result.api_results?.endpoints_detected ?? 0}</p>
          {(result.api_results?.endpoints_detected ?? 0) === 0 && (
            <p className="text-cyan-800">No endpoints were detected from passive page-source analysis. This usually means APIs are bundled or dynamically loaded beyond static HTML parsing.</p>
          )}
        </div>
      </div>

      {result.e2e_results && (
        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 mb-8 border border-purple-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-lg flex items-center justify-center shadow">
              <Mail className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">E2E Testing Result</h3>
              <p className="text-xs text-gray-600">Detailed testing results sent to your email</p>
            </div>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200 shadow-sm text-sm text-gray-700 space-y-1">
            <p>{analysisExplanations.e2e || 'E2E analysis explanation is not available yet for this scan.'}</p>
            <p>Buttons: {result.e2e_results.buttons_found ?? 0}, Links: {result.e2e_results.links_found ?? 0}, Forms: {result.e2e_results.forms_found ?? 0}</p>
            {(result.e2e_results.buttons_found ?? 0) + (result.e2e_results.links_found ?? 0) + (result.e2e_results.forms_found ?? 0) === 0 && (
              <p className="text-purple-800">No interactive elements were detected on the scanned page. The page may be static or rendered dynamically after load.</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-indigo-50 rounded-lg p-6 mb-8 border border-indigo-200">
        <h3 className="text-lg font-bold text-gray-900 mb-3 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-indigo-600" />
          YSlow Compatibility Result
        </h3>
        <div className="text-sm text-gray-700 space-y-2">
          <p>{analysisExplanations.yslow || 'YSlow-style explanation is not available yet for this scan.'}</p>
          <p><span className="font-medium">YSlow score:</span> {result.yslow_score ?? 0}/100</p>
          <p><span className="font-medium">Grade:</span> {result.yslow_results?.grade || 'N/A'}</p>
          <p><span className="font-medium">Total requests:</span> {result.yslow_results?.metrics?.total_requests ?? 'N/A'}</p>
          <p><span className="font-medium">Avg asset cache TTL (seconds):</span> {result.yslow_results?.metrics?.avg_asset_cache_ttl_seconds ?? 'N/A'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {result.technologies && result.technologies.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              Technologies Detected
            </h3>
            <div className="flex flex-wrap gap-2">
              {result.technologies.map((tech, idx) => (
                <span key={idx} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium border border-blue-200">
                  {tech}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Lock className="w-5 h-5 text-orange-600" />
            Scan Metadata
          </h3>
          <div className="text-sm text-gray-700 space-y-1">
            <p>Scan date: {new Date(result.created_at).toLocaleString()}</p>
            <p>Scan duration: {scanDurationSeconds ? `${scanDurationSeconds}s` : 'N/A'}</p>
            <p>Pages scanned: {result.pages_scanned ?? 1}</p>
            <p>Scan depth: {result.scan_depth ?? 1}</p>
            <p>Environment: {result.scan_environment || (result.performance_results?.source === 'google-pagespeed' ? 'Mobile' : 'Desktop')}</p>
          </div>
        </div>
      </div>

      {(result.crawl_results && result.crawl_results.length > 0) && (
        <div className="bg-gray-50 rounded-lg p-6 mb-8 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Crawled Pages</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {result.crawl_results.slice(0, 20).map((page, index) => (
              <div key={`${page.url}-${index}`} className="bg-white rounded border border-gray-200 p-3 text-sm text-gray-700">
                <p className="font-medium break-all">{page.url}</p>
                <p className="text-xs text-gray-500 mt-1">Depth: {page.depth} • Status: {page.status} • Load: {page.load_time_ms}ms • Links discovered: {page.links_discovered ?? 0}</p>
              </div>
            ))}
          </div>
        </div>
      )}

        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Top Issues Found
          </h3>
          <div className="space-y-3">
            {isScanning ? (
              <>
                <div className="p-4 rounded-lg border border-gray-300 bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-gray-300 rounded animate-pulse mt-0.5" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-300 rounded w-32 animate-pulse mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg border border-gray-300 bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-gray-300 rounded animate-pulse mt-0.5" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-300 rounded w-32 animate-pulse mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="p-4 rounded-lg border border-gray-300 bg-gray-50">
                  <div className="flex items-start gap-3">
                    <div className="w-5 h-5 bg-gray-300 rounded animate-pulse mt-0.5" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-300 rounded w-32 animate-pulse mb-2" />
                      <div className="h-3 bg-gray-200 rounded w-full animate-pulse" />
                    </div>
                  </div>
                </div>
              </>
            ) : result.top_issues && result.top_issues.length > 0 ? (
              result.top_issues.slice(0, 3).map((issue, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-lg border ${getSeverityColor(issue.severity)}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">{getCategoryIcon(issue.category)}</div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-sm uppercase">{issue.category}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white bg-opacity-50">
                          {issue.severity}
                        </span>
                      </div>
                      <p className="text-sm">{issue.description}</p>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-4">No critical issues detected</p>
            )}
          </div>
        </div>
      </div>

      {!submitted ? (
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg shadow-lg p-8 border border-blue-200">
          <div className="text-center mb-6">
            <Mail className="w-12 h-12 text-blue-600 mx-auto mb-3" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Get Your Full Report</h2>
            <p className="text-gray-700">
              Detailed analysis with actionable recommendations delivered to your email
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" aria-label="Email report request form">
            <div>
              <label htmlFor="email-input" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address <span aria-label="required">*</span>
              </label>
              <input
                id="email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email) {
                    handleSubmit(e as any);
                  }
                }}
                placeholder="your@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={submitting}
                required
                aria-required="true"
                aria-label="Email address for receiving scan report"
                aria-describedby={error ? "email-error" : undefined}
              />
              {error && (
                <p id="email-error" className="text-red-600 text-sm mt-2" role="alert">
                  {error}
                </p>
              )}
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOptIn(!optIn);
                  }
                }}
                className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white"
                aria-label="Extend result storage duration"
              />
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                Store my results longer than 30 days for future reference
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSubmit(e as any);
                }
              }}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-50"
              aria-label={submitting ? 'Sending report email' : 'Send full report to email'}
              aria-busy={submitting}
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-5 h-5" />
                  Send Full Report
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-blue-200 text-center">
            <a
              href="https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-700 font-medium hover:text-blue-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-blue-50 rounded px-2 py-1"
              aria-label="Schedule 12-minute quality assurance consultation with team opens in new window"
            >
              <Calendar className="w-5 h-5" />
              Book 12-min QA Consultation →
            </a>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 rounded-lg shadow-lg p-8 border border-green-200">
          <div className="text-center">
            <CheckCircle className="w-16 h-16 text-green-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Report Sent!</h2>
            <p className="text-gray-700 mb-4" role="status" aria-live="polite">
              Check your inbox at <span className="font-medium">{email}</span>
            </p>
            <p className="text-sm text-gray-600 mb-6">
              Don't see it? Check your spam folder or contact support.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onScanAnother}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onScanAnother();
                  }
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-green-50"
                aria-label="Scan another website"
              >
                Scan Another Website
              </button>
              <a
                href="https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-700 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-green-50"
                aria-label="Book 12-minute quality assurance consultation opens in new window"
              >
                <Calendar className="w-5 h-5" />
                Book 12-min QA Consultation
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
