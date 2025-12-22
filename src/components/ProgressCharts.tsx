import { useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, Radar, PolarAngleAxis, PolarRadiusAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { ScanResult } from '../types/scan';

interface ProgressChartsProps {
  scans: ScanResult[];
}

export function ProgressCharts({ scans }: ProgressChartsProps) {
  const completedScans = useMemo(() => {
    return scans
      .filter(s => s.scan_status === 'completed')
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [scans]);

  const progressData = useMemo(() => {
    return completedScans.map((scan, idx) => ({
      name: `Scan ${idx + 1}`,
      date: new Date(scan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      overall: scan.overall_score ?? 0,
      performance: scan.performance_score ?? 0,
      seo: scan.seo_score ?? 0,
      accessibility: Math.max(0, 100 - (scan.accessibility_issue_count ?? 0) * 10),
      security: scan.security_checks_passed ?? 0,
    }));
  }, [completedScans]);

  const radarData = useMemo(() => {
    if (completedScans.length === 0) return [];
    const lastScan = completedScans[completedScans.length - 1];
    return [
      { metric: 'Overall', value: lastScan.overall_score ?? 0, fullMark: 100 },
      { metric: 'Performance', value: lastScan.performance_score ?? 0, fullMark: 100 },
      { metric: 'SEO', value: lastScan.seo_score ?? 0, fullMark: 100 },
      { metric: 'Accessibility', value: Math.max(0, 100 - (lastScan.accessibility_issue_count ?? 0) * 10), fullMark: 100 },
      { metric: 'Security', value: lastScan.security_checks_passed ?? 0, fullMark: 7 },
    ];
  }, [completedScans]);

  const stats = useMemo(() => {
    if (progressData.length === 0) {
      return { avgScore: 0, improvement: 0, totalScans: 0 };
    }

    const first = progressData[0];
    const last = progressData[progressData.length - 1];
    const improvement = last.overall - first.overall;
    const avgScore = Math.round(progressData.reduce((sum, d) => sum + d.overall, 0) / progressData.length);

    return {
      avgScore,
      improvement,
      totalScans: progressData.length,
    };
  }, [progressData]);

  if (completedScans.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-8">
        <div className="text-center py-12">
          <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 text-lg">No completed scans yet</p>
          <p className="text-gray-500 text-sm">Complete at least one scan to see progress charts</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8" role="region" aria-label="scan progress and analytics charts">
      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <article className="bg-white rounded-lg shadow p-6 border-l-4 border-blue-500">
          <p className="text-gray-600 text-sm font-medium">Average Score</p>
          <p className="text-3xl font-bold text-blue-600 mt-2" aria-label={`Average score across all scans: ${stats.avgScore} out of 100`}>{stats.avgScore}</p>
        </article>
        <article className="bg-white rounded-lg shadow p-6 border-l-4 border-green-500">
          <p className="text-gray-600 text-sm font-medium">Improvement</p>
          <p className={`text-3xl font-bold mt-2 ${stats.improvement >= 0 ? 'text-green-600' : 'text-red-600'}`} aria-label={`Score improvement from first to last scan: ${stats.improvement > 0 ? 'plus' : 'minus'} ${Math.abs(stats.improvement)} points`}>
            {stats.improvement > 0 ? '+' : ''}{stats.improvement}
          </p>
        </article>
        <article className="bg-white rounded-lg shadow p-6 border-l-4 border-purple-500">
          <p className="text-gray-600 text-sm font-medium">Total Scans</p>
          <p className="text-3xl font-bold text-purple-600 mt-2" aria-label={`Total number of completed scans: ${stats.totalScans}`}>{stats.totalScans}</p>
        </article>
      </div>

      {/* Overall Score Progression */}
      <article className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Overall Score Progression</h2>
        <div role="img" aria-label={`Line chart showing overall score progression across ${stats.totalScans} scans`}>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="overall"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: '#3b82f6', r: 4 }}
                activeDot={{ r: 6 }}
                name="Overall Score"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      {/* Category Performance */}
      <article className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Category Performance Trends</h2>
        <div role="img" aria-label="Line chart showing performance trends across categories: performance, SEO, and accessibility">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="performance" stroke="#10b981" name="Performance" />
              <Line type="monotone" dataKey="seo" stroke="#f59e0b" name="SEO" />
              <Line type="monotone" dataKey="accessibility" stroke="#8b5cf6" name="Accessibility" />
              <Line type="monotone" dataKey="security" stroke="#ef4444" name="Security" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </article>

      {/* Last Scan Radar */}
      {radarData.length > 0 && (
        <article className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Latest Scan Overview</h2>
          <div role="img" aria-label="Radar chart showing latest scan scores across all metrics: overall, performance, SEO, accessibility, and security">
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={radarData}>
                <PolarAngleAxis dataKey="metric" />
                <PolarRadiusAxis domain={[0, 100]} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                />
                <Tooltip />
                <Legend />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}

      {/* Comparison - First vs Last */}
      {progressData.length > 1 && (
        <article className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">First vs Latest Scan</h2>
          <div role="img" aria-label={`Bar chart comparing first scan score of ${progressData[0].overall} with latest scan score of ${progressData[progressData.length - 1].overall}`}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={[
                  {
                    name: 'Category',
                    first: progressData[0].overall,
                    latest: progressData[progressData.length - 1].overall,
                },
                {
                  name: 'Performance',
                  first: progressData[0].performance,
                  latest: progressData[progressData.length - 1].performance,
                },
                {
                  name: 'SEO',
                  first: progressData[0].seo,
                  latest: progressData[progressData.length - 1].seo,
                },
                {
                  name: 'Accessibility',
                  first: progressData[0].accessibility,
                  latest: progressData[progressData.length - 1].accessibility,
                },
              ]}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} />
                <Tooltip />
                <Legend />
                <Bar dataKey="first" fill="#cbd5e1" name="First Scan" />
                <Bar dataKey="latest" fill="#3b82f6" name="Latest Scan" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      )}
    </div>
  );
}
