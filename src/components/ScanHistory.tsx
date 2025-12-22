import { useState, useEffect } from 'react';
import { Trash2, Eye, Download, Calendar, TrendingUp } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import type { ScanResult } from '../types/scan';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

export function ScanHistory() {
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'score'>('newest');

  useEffect(() => {
    fetchScans();
  }, []);

  const fetchScans = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('scan_results')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setScans(data || []);
    } catch (err) {
      console.error('Failed to fetch scans:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteScan = async (scanId: string) => {
    if (!confirm('Are you sure you want to delete this scan?')) return;
    
    try {
      const { error } = await supabase
        .from('scan_results')
        .delete()
        .eq('id', scanId);

      if (error) throw error;
      setScans(scans.filter(s => s.id !== scanId));
    } catch (err) {
      console.error('Failed to delete scan:', err);
    }
  };

  const getFilteredScans = () => {
    let filtered = scans;

    if (filter === 'completed') {
      filtered = filtered.filter(s => s.scan_status === 'completed');
    } else if (filter === 'failed') {
      filtered = filtered.filter(s => s.scan_status === 'failed');
    }

    if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    } else if (sortBy === 'score') {
      filtered.sort((a, b) => (b.overall_score ?? 0) - (a.overall_score ?? 0));
    }

    return filtered;
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getScoreColor = (score?: number) => {
    if (!score) return 'text-gray-600';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const filteredScans = getFilteredScans();

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Calendar className="w-6 h-6 text-blue-600" />
          Scan History
        </h1>
        <p className="text-gray-600">View and manage all your website scans</p>
      </div>

      {/* Filters & Sort */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Filter by Status
          </label>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Filter scans by status"
          >
            <option value="all">All Scans</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Sort By
          </label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            aria-label="Sort scans by date or score"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="score">Highest Score</option>
          </select>
        </div>

        <button
          onClick={fetchScans}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fetchScans();
            }
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition mt-auto focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          aria-label="Refresh scan history list"
        >
          Refresh
        </button>
      </div>

      {/* Scans Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-4">Loading scans...</p>
        </div>
      ) : filteredScans.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No scans yet</p>
          <p className="text-gray-500 text-sm">Create your first scan to get started</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b-2 border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">URL</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Score</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredScans.map((scan) => (
                <tr
                  key={scan.id}
                  className="border-b border-gray-200 hover:bg-gray-50 transition"
                >
                  <td className="px-6 py-4">
                    <a
                      href={scan.target_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline truncate block"
                    >
                      {scan.target_url}
                    </a>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-lg font-bold ${getScoreColor(scan.overall_score)}`}>
                      {scan.overall_score ?? '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        scan.scan_status === 'completed'
                          ? 'bg-green-100 text-green-800'
                          : scan.scan_status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {scan.scan_status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600">
                    {formatDate(scan.created_at)}
                  </td>
                  <td className="px-6 py-4 flex gap-2">
                    <button
                      onClick={() => window.open(`/scan/${scan.id}`, '_blank')}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          window.open(`/scan/${scan.id}`, '_blank');
                        }
                      }}
                      className="p-2 hover:bg-blue-100 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                      aria-label={`View scan results for ${scan.target_url}`}
                      title="View Details"
                    >
                      <Eye className="w-4 h-4 text-blue-600" />
                    </button>
                    <button
                      onClick={() => console.log('Download:', scan.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          console.log('Download:', scan.id);
                        }
                      }}
                      className="p-2 hover:bg-green-100 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                      aria-label={`Download PDF report for ${scan.target_url}`}
                      title="Download PDF"
                    >
                      <Download className="w-4 h-4 text-green-600" />
                    </button>
                    <button
                      onClick={() => deleteScan(scan.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          deleteScan(scan.id);
                        }
                      }}
                      className="p-2 hover:bg-red-100 rounded-lg transition focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                      aria-label={`Delete scan for ${scan.target_url}`}
                      title="Delete Scan"
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-6 text-sm text-gray-600">
        Showing {filteredScans.length} of {scans.length} scans
      </div>
    </div>
  );
}
