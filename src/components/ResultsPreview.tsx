import { useState } from 'react';
import { Shield, Zap, Eye, AlertTriangle, Mail, Loader2, CheckCircle, Search, Lock, BarChart3, Calendar } from 'lucide-react';
import type { ScanResult } from '../types/scan';

interface ResultsPreviewProps {
  result: ScanResult;
  onEmailSubmit: (email: string, optIn: boolean) => Promise<void>;
  onScanAnother: () => void;
}

export function ResultsPreview({ result, onEmailSubmit, onScanAnother }: ResultsPreviewProps) {
  const [email, setEmail] = useState('');
  const [optIn, setOptIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

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
    } catch (err) {
      setError('Failed to send report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'security':
        return <Shield className="w-4 h-4" />;
      case 'performance':
        return <Zap className="w-4 h-4" />;
      case 'accessibility':
        return <Eye className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  if (result.scan_status === 'failed') {
    return (
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan Failed</h2>
          <p className="text-gray-600 mb-6">
            We couldn't complete the scan. Please check the URL and try again.
          </p>
          <button
            onClick={onScanAnother}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            Scan Another Website
          </button>
        </div>
      </div>
    );
  }

  if (result.scan_status !== 'completed') {
    return (
      <div className="w-full max-w-3xl bg-white rounded-lg shadow-lg p-8">
        <div className="text-center">
          <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Analyzing Your Website...</h2>
          <p className="text-gray-600">This usually takes 30-60 seconds</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-5xl space-y-6">
      <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-xl shadow-2xl p-8 border-2 border-blue-500">
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

        {(result.ai_summary || (result.ai_recommendations && result.ai_recommendations.length > 0)) && (
          <div>

          {result.ai_summary && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 mb-6 border border-white/20">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-lg font-bold text-white">AI Analysis Summary</h3>
                <span className="text-xs font-medium px-2 py-1 bg-blue-500 text-white rounded-full">Powered by GPT-4</span>
              </div>
              <p className="text-blue-100 leading-relaxed text-base">{result.ai_summary}</p>
            </div>
          )}

          {result.ai_recommendations && result.ai_recommendations.length > 0 && (
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-6 border border-white/20">
              <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI-Powered Recommendations
              </h3>
              <div className="space-y-3">
                {result.ai_recommendations.map((rec, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                    <span className="flex-shrink-0 w-6 h-6 bg-gradient-to-br from-green-400 to-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg">
                      {idx + 1}
                    </span>
                    <p className="text-blue-100 leading-relaxed flex-1">{rec}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan Results</h2>
          <p className="text-gray-600">Detailed technical analysis of your website</p>
        </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-green-500">
          <div className="flex items-center justify-between mb-2">
            <Zap className="w-8 h-8 text-green-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.performance_score ?? (result.performance_results as any)?.score ?? 0}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">Performance</p>
          <p className="text-xs text-gray-500 mt-1">Lighthouse Mobile Score</p>
        </div>

        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-blue-500">
          <div className="flex items-center justify-between mb-2">
            <Search className="w-8 h-8 text-blue-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.seo_score ?? (result.performance_results as any)?.lighthouse_scores?.seo ?? 0}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">SEO</p>
          <p className="text-xs text-gray-500 mt-1">Overall SEO Score</p>
        </div>

        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-orange-500">
          <div className="flex items-center justify-between mb-2">
            <Eye className="w-8 h-8 text-orange-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.accessibility_issue_count ?? (result.accessibility_results as any)?.total_issues ?? 0}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">Accessibility</p>
          <p className="text-xs text-gray-500 mt-1">Critical & serious issues</p>
        </div>

        <div className="bg-gray-50 rounded-lg shadow p-6 border-l-4 border-red-500">
          <div className="flex items-center justify-between mb-2">
            <Shield className="w-8 h-8 text-red-600" />
            <span className="text-3xl font-bold text-gray-900">
              {result.security_checks_passed ?? ((result.security_results as any)?.issues ? (7 - (result.security_results as any).issues.length) : 7)}/{result.security_checks_total || 7}
            </span>
          </div>
          <p className="text-sm font-medium text-gray-600">Security</p>
          <p className="text-xs text-gray-500 mt-1">Security checks passed</p>
        </div>
      </div>

      {(result.performance_results as any)?.core_web_vitals && (result.performance_results as any)?.source === 'google-pagespeed' && (
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-6 mb-8 border border-green-200">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-green-500 to-emerald-600 rounded-lg flex items-center justify-center shadow">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">Core Web Vitals</h3>
              <p className="text-xs text-gray-600">Powered by Google PageSpeed Insights</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results as any).core_web_vitals.fcp / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">First Contentful Paint</div>
              <div className="text-xs text-gray-500 mt-1">How quickly content appears</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results as any).core_web_vitals.lcp / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Largest Contentful Paint</div>
              <div className="text-xs text-gray-500 mt-1">Main content load time</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{(result.performance_results as any).core_web_vitals.cls}</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Cumulative Layout Shift</div>
              <div className="text-xs text-gray-500 mt-1">Visual stability score</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{Math.round((result.performance_results as any).core_web_vitals.tbt)}ms</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Total Blocking Time</div>
              <div className="text-xs text-gray-500 mt-1">Interactivity delay</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results as any).core_web_vitals.tti / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Time to Interactive</div>
              <div className="text-xs text-gray-500 mt-1">When page is usable</div>
            </div>
            <div className="bg-white rounded-lg p-4 border border-green-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{((result.performance_results as any).core_web_vitals.speedIndex / 1000).toFixed(2)}s</div>
              <div className="text-xs font-medium text-gray-600 mt-1">Speed Index</div>
              <div className="text-xs text-gray-500 mt-1">Visual completion speed</div>
            </div>
          </div>
        </div>
      )}

      {(result.performance_results as any)?.lighthouse_scores && (result.performance_results as any)?.source === 'google-pagespeed' && (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 mb-8 border border-blue-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Google Lighthouse Scores
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
              <div className={`text-3xl font-bold ${getScoreColor((result.performance_results as any).lighthouse_scores.performance)}`}>
                {(result.performance_results as any).lighthouse_scores.performance}
              </div>
              <div className="text-sm font-medium text-gray-600 mt-2">Performance</div>
            </div>
            {(result.performance_results as any).lighthouse_scores.accessibility && (
              <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
                <div className={`text-3xl font-bold ${getScoreColor((result.performance_results as any).lighthouse_scores.accessibility)}`}>
                  {(result.performance_results as any).lighthouse_scores.accessibility}
                </div>
                <div className="text-sm font-medium text-gray-600 mt-2">Accessibility</div>
              </div>
            )}
            {(result.performance_results as any).lighthouse_scores.bestPractices && (
              <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
                <div className={`text-3xl font-bold ${getScoreColor((result.performance_results as any).lighthouse_scores.bestPractices)}`}>
                  {(result.performance_results as any).lighthouse_scores.bestPractices}
                </div>
                <div className="text-sm font-medium text-gray-600 mt-2">Best Practices</div>
              </div>
            )}
            <div className="bg-white rounded-lg p-4 border border-blue-200 shadow-sm text-center">
              <div className={`text-3xl font-bold ${getScoreColor((result.performance_results as any).lighthouse_scores.seo)}`}>
                {(result.performance_results as any).lighthouse_scores.seo}
              </div>
              <div className="text-sm font-medium text-gray-600 mt-2">SEO</div>
            </div>
          </div>
        </div>
      )}

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

        {result.exposed_endpoints && result.exposed_endpoints.length > 0 && (
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Lock className="w-5 h-5 text-orange-600" />
              Exposed API Endpoints
            </h3>
            <div className="space-y-2">
              {result.exposed_endpoints.slice(0, 5).map((endpoint, idx) => (
                <div key={idx} className="px-3 py-2 bg-orange-50 text-orange-800 rounded text-sm font-mono border border-orange-200 break-all">
                  {endpoint}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

        <div>
          <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            Top Issues Found
          </h3>
          <div className="space-y-3">
            {result.top_issues && result.top_issues.length > 0 ? (
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
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Get Your Full Report</h3>
            <p className="text-gray-700">
              Detailed analysis with actionable recommendations delivered as a PDF
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={submitting}
              />
              {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={optIn}
                onChange={(e) => setOptIn(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">
                Store my results longer than 30 days for future reference
              </span>
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium text-lg"
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
              className="inline-flex items-center gap-2 text-blue-700 font-medium hover:text-blue-800 transition-colors"
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
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Report Sent!</h3>
            <p className="text-gray-700 mb-4">
              Check your inbox at <span className="font-medium">{email}</span>
            </p>
            <p className="text-sm text-gray-600 mb-6">
              Don't see it? Check your spam folder or contact support.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={onScanAnother}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Scan Another Website
              </button>
              <a
                href="https://timerex.net/s/sales_5e77_b801/482a66cf?apiKey=1ufKAEnDi4T0pk5lftqMqjiNmF5SQh8x3Va4pLe5oitNLtgKCuI7BKH5sI0SGLeI"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white text-blue-700 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition-colors font-medium"
              >
                <Calendar className="w-5 h-5" />
                Book 12-min QA Consultation
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
