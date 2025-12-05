'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface Report {
  id: number;
  cardId: string;
  cardSlug: string;
  cardName: string;
  cardThumbnail: string | null;
  reporterId: string;
  reporterUsername: string;
  reason: string;
  details: string | null;
  status: 'pending' | 'reviewed' | 'resolved' | 'dismissed';
  createdAt: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

type FilterStatus = 'all' | 'pending' | 'reviewed' | 'resolved' | 'dismissed';

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  inappropriate_content: 'Inappropriate Content',
  copyright: 'Copyright Violation',
  other: 'Other',
};

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('pending');

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/reports?${params}`);
      if (!res.ok) throw new Error('Failed to fetch reports');

      const data = await res.json();
      setReports(data.items);
      setPagination(prev => ({
        ...prev,
        total: data.total,
        hasMore: data.hasMore,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleStatusChange = async (reportId: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update report status');
      fetchReports();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleBlockCard = async (cardId: string, reportId: number) => {
    if (!confirm('Block this card and resolve the report?')) return;

    try {
      // Block the card
      await fetch(`/api/admin/cards/${cardId}/visibility`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: 'blocked' }),
      });

      // Resolve the report
      await fetch(`/api/admin/reports/${reportId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      });

      fetchReports();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to block card');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'reviewed':
        return 'bg-blue-500/20 text-blue-400';
      case 'resolved':
        return 'bg-green-500/20 text-green-400';
      case 'dismissed':
        return 'bg-gray-500/20 text-gray-400';
      default:
        return 'bg-gray-500/20 text-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-starlight">Reports</h1>
        <div className="flex items-center gap-2">
          <label className="text-sm text-starlight/70">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as FilterStatus)}
            className="px-3 py-2 bg-deep-space border border-nebula/30 rounded-lg text-starlight focus:outline-none focus:border-nebula"
          >
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="reviewed">Reviewed</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nebula"></div>
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400">Error: {error}</p>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-cosmic-teal/30 rounded-lg p-8 border border-nebula/20 text-center">
          <svg className="w-12 h-12 text-starlight/30 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-starlight/70">No reports found</p>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="bg-cosmic-teal/30 rounded-lg p-4 border border-nebula/20"
              >
                <div className="flex items-start gap-4">
                  {/* Card Thumbnail */}
                  <div className="w-16 h-16 bg-deep-space rounded overflow-hidden flex-shrink-0">
                    {report.cardThumbnail ? (
                      <Image
                        src={`/api/uploads/${report.cardThumbnail}`}
                        alt={report.cardName}
                        width={64}
                        height={64}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-starlight/30">
                        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                    )}
                  </div>

                  {/* Report Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <Link
                          href={`/card/${report.cardSlug}`}
                          className="text-lg font-medium text-starlight hover:text-nebula transition-colors"
                          target="_blank"
                        >
                          {report.cardName}
                        </Link>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(report.status)}`}>
                            {report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                          </span>
                          <span className="px-2 py-0.5 bg-nebula/20 text-nebula rounded text-xs font-medium">
                            {REASON_LABELS[report.reason] || report.reason}
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <select
                          value={report.status}
                          onChange={(e) => handleStatusChange(report.id, e.target.value)}
                          className="px-2 py-1 bg-deep-space border border-nebula/30 rounded text-sm text-starlight focus:outline-none focus:border-nebula"
                        >
                          <option value="pending">Pending</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="resolved">Resolved</option>
                          <option value="dismissed">Dismissed</option>
                        </select>
                        <button
                          onClick={() => handleBlockCard(report.cardId, report.id)}
                          className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-sm transition-colors"
                        >
                          Block Card
                        </button>
                      </div>
                    </div>

                    {/* Details */}
                    {report.details && (
                      <p className="mt-2 text-sm text-starlight/70 bg-deep-space/50 rounded p-2">
                        {report.details}
                      </p>
                    )}

                    {/* Meta */}
                    <div className="mt-2 text-xs text-starlight/50">
                      Reported by <span className="text-starlight/70">{report.reporterUsername}</span>
                      {' • '}
                      {formatDate(report.createdAt)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-starlight/70">
              Showing {reports.length} of {pagination.total} reports
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-4 py-2 bg-nebula/20 hover:bg-nebula/30 disabled:opacity-50 disabled:cursor-not-allowed text-starlight rounded-lg transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPagination(p => ({ ...p, page: p.page + 1 }))}
                disabled={!pagination.hasMore}
                className="px-4 py-2 bg-nebula/20 hover:bg-nebula/30 disabled:opacity-50 disabled:cursor-not-allowed text-starlight rounded-lg transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
