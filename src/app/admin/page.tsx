'use client';

import { useEffect, useState } from 'react';

interface AdminStats {
  totalCards: number;
  totalUsers: number;
  totalDownloads: number;
  pendingReports: number;
  cardsToday: number;
  cardsByVisibility: {
    public: number;
    nsfw_only: number;
    unlisted: number;
    blocked: number;
  };
  cardsByModeration: {
    ok: number;
    review: number;
    blocked: number;
  };
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const res = await fetch('/api/admin/stats');
        if (!res.ok) {
          throw new Error('Failed to fetch stats');
        }
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nebula"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-starlight">Dashboard</h1>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Cards"
          value={stats.totalCards}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          }
        />
        <StatCard
          title="Total Users"
          value={stats.totalUsers}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
        <StatCard
          title="Total Downloads"
          value={stats.totalDownloads}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
          }
        />
        <StatCard
          title="Pending Reports"
          value={stats.pendingReports}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
          highlight={stats.pendingReports > 0}
        />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cards by Visibility */}
        <div className="bg-cosmic-teal/30 rounded-lg p-6 border border-nebula/20">
          <h2 className="text-lg font-semibold text-starlight mb-4">Cards by Visibility</h2>
          <div className="space-y-3">
            <ProgressBar
              label="Public"
              value={stats.cardsByVisibility.public}
              total={stats.totalCards}
              color="bg-green-500"
            />
            <ProgressBar
              label="NSFW Only"
              value={stats.cardsByVisibility.nsfw_only}
              total={stats.totalCards}
              color="bg-orange-500"
            />
            <ProgressBar
              label="Unlisted"
              value={stats.cardsByVisibility.unlisted}
              total={stats.totalCards}
              color="bg-yellow-500"
            />
            <ProgressBar
              label="Blocked"
              value={stats.cardsByVisibility.blocked}
              total={stats.totalCards}
              color="bg-red-500"
            />
          </div>
        </div>

        {/* Cards by Moderation State */}
        <div className="bg-cosmic-teal/30 rounded-lg p-6 border border-nebula/20">
          <h2 className="text-lg font-semibold text-starlight mb-4">Moderation Status</h2>
          <div className="space-y-3">
            <ProgressBar
              label="OK"
              value={stats.cardsByModeration.ok}
              total={stats.totalCards}
              color="bg-green-500"
            />
            <ProgressBar
              label="Needs Review"
              value={stats.cardsByModeration.review}
              total={stats.totalCards}
              color="bg-yellow-500"
            />
            <ProgressBar
              label="Blocked"
              value={stats.cardsByModeration.blocked}
              total={stats.totalCards}
              color="bg-red-500"
            />
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="bg-cosmic-teal/30 rounded-lg p-6 border border-nebula/20">
        <h2 className="text-lg font-semibold text-starlight mb-4">Today&apos;s Activity</h2>
        <p className="text-starlight/70">
          <span className="text-2xl font-bold text-nebula">{stats.cardsToday}</span> new cards uploaded today
        </p>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  highlight = false,
}: {
  title: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`bg-cosmic-teal/30 rounded-lg p-6 border ${
        highlight ? 'border-red-500/50 bg-red-500/10' : 'border-nebula/20'
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-starlight/70">{title}</p>
          <p className={`text-3xl font-bold ${highlight ? 'text-red-400' : 'text-starlight'}`}>
            {value.toLocaleString()}
          </p>
        </div>
        <div className={`${highlight ? 'text-red-400' : 'text-nebula'}`}>{icon}</div>
      </div>
    </div>
  );
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const percentage = total > 0 ? (value / total) * 100 : 0;

  return (
    <div>
      <div className="flex justify-between text-sm mb-1">
        <span className="text-starlight/70">{label}</span>
        <span className="text-starlight">{value.toLocaleString()}</span>
      </div>
      <div className="h-2 bg-deep-space rounded-full overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
