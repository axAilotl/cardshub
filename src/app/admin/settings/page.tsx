'use client';

import { useEffect, useState } from 'react';

interface AdminSetting {
  key: string;
  value: string;
  description: string | null;
  updated_at: number;
  updated_by: string | null;
}

interface StorageStats {
  totalObjects: number;
  totalSize: number;
  referencedCount: number;
  orphanedCount: number;
  orphanedSize: number;
  orphanedKeys: string[];
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [storageLoading, setStorageLoading] = useState(false);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  async function fetchSettings() {
    try {
      const res = await fetch('/api/admin/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      setSettings(data.settings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  async function fetchStorageStats() {
    setStorageLoading(true);
    try {
      const res = await fetch('/api/admin/storage');
      if (!res.ok) throw new Error('Failed to fetch storage stats');
      const data = await res.json();
      setStorageStats(data);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to fetch storage stats' });
    } finally {
      setStorageLoading(false);
    }
  }

  async function toggleSetting(key: string, currentValue: string) {
    const newValue = currentValue === 'true' ? 'false' : 'true';

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: newValue }),
      });

      if (!res.ok) throw new Error('Failed to update setting');

      setSettings(prev =>
        prev.map(s => (s.key === key ? { ...s, value: newValue, updated_at: Date.now() / 1000 } : s))
      );
      setMessage({ type: 'success', text: `${key} updated to ${newValue}` });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to update setting' });
    }

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000);
  }

  async function cleanupOrphanedFiles() {
    if (!confirm('Are you sure you want to delete all orphaned files? This cannot be undone.')) {
      return;
    }

    setCleanupLoading(true);
    try {
      const res = await fetch('/api/admin/storage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });

      if (!res.ok) throw new Error('Failed to cleanup storage');

      const data = await res.json();
      setMessage({
        type: 'success',
        text: `Cleaned up ${data.deleted} files (${data.failed} failed)`,
      });

      // Refresh stats
      fetchStorageStats();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to cleanup storage' });
    } finally {
      setCleanupLoading(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-starlight">Settings</h1>

      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === 'success'
              ? 'bg-green-500/20 border border-green-500/50 text-green-400'
              : 'bg-red-500/20 border border-red-500/50 text-red-400'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Feature Toggles */}
      <div className="bg-cosmic-teal/30 rounded-lg p-6 border border-nebula/20">
        <h2 className="text-lg font-semibold text-starlight mb-4">Feature Toggles</h2>
        <div className="space-y-4">
          {settings.map(setting => (
            <div
              key={setting.key}
              className="flex items-center justify-between py-3 border-b border-nebula/10 last:border-0"
            >
              <div className="flex-1">
                <p className="text-starlight font-medium">{formatSettingName(setting.key)}</p>
                <p className="text-sm text-starlight/60">{setting.description}</p>
              </div>
              <button
                onClick={() => toggleSetting(setting.key, setting.value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  setting.value === 'true' ? 'bg-nebula' : 'bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    setting.value === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Storage Management */}
      <div className="bg-cosmic-teal/30 rounded-lg p-6 border border-nebula/20">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-starlight">Storage Management</h2>
          <button
            onClick={fetchStorageStats}
            disabled={storageLoading}
            className="px-4 py-2 bg-nebula/20 hover:bg-nebula/30 text-starlight rounded-lg transition-colors disabled:opacity-50"
          >
            {storageLoading ? 'Scanning...' : 'Scan Storage'}
          </button>
        </div>

        {storageStats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-deep-space/50 rounded-lg p-4">
                <p className="text-sm text-starlight/60">Total Objects</p>
                <p className="text-xl font-bold text-starlight">{storageStats.totalObjects.toLocaleString()}</p>
              </div>
              <div className="bg-deep-space/50 rounded-lg p-4">
                <p className="text-sm text-starlight/60">Total Size</p>
                <p className="text-xl font-bold text-starlight">{formatBytes(storageStats.totalSize)}</p>
              </div>
              <div className="bg-deep-space/50 rounded-lg p-4">
                <p className="text-sm text-starlight/60">Referenced</p>
                <p className="text-xl font-bold text-green-400">{storageStats.referencedCount.toLocaleString()}</p>
              </div>
              <div className="bg-deep-space/50 rounded-lg p-4">
                <p className="text-sm text-starlight/60">Orphaned</p>
                <p className="text-xl font-bold text-red-400">{storageStats.orphanedCount.toLocaleString()}</p>
              </div>
            </div>

            {storageStats.orphanedCount > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-starlight/70">
                    {storageStats.orphanedCount} orphaned files ({formatBytes(storageStats.orphanedSize)})
                  </p>
                  <button
                    onClick={cleanupOrphanedFiles}
                    disabled={cleanupLoading}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {cleanupLoading ? 'Cleaning...' : 'Delete All Orphans'}
                  </button>
                </div>

                {storageStats.orphanedKeys.length > 0 && (
                  <div className="bg-deep-space/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                    <p className="text-xs text-starlight/50 mb-2">
                      Showing {storageStats.orphanedKeys.length} of {storageStats.orphanedCount} orphaned files:
                    </p>
                    <ul className="text-xs text-starlight/70 space-y-1 font-mono">
                      {storageStats.orphanedKeys.map(key => (
                        <li key={key} className="truncate">
                          {key}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-starlight/60">Click &quot;Scan Storage&quot; to analyze R2 bucket for orphaned files.</p>
        )}
      </div>
    </div>
  );
}

function formatSettingName(key: string): string {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
