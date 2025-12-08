'use client';

import { useEffect, useState, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';

interface AdminCollection {
  id: string;
  slug: string;
  name: string;
  creator: string | null;
  visibility: 'public' | 'nsfw_only' | 'unlisted' | 'blocked';
  thumbnailPath: string | null;
  itemsCount: number;
  downloadsCount: number;
  createdAt: number;
  uploader: {
    id: string;
    username: string;
  } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

type FilterVisibility = 'all' | 'public' | 'nsfw_only' | 'unlisted' | 'blocked';

export default function AdminCollectionsPage() {
  const [collections, setCollections] = useState<AdminCollection[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [visibility, setVisibility] = useState<FilterVisibility>('all');

  const fetchCollections = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (search) params.set('search', search);
      if (visibility !== 'all') params.set('visibility', visibility);

      const res = await fetch(`/api/admin/collections?${params}`);
      if (!res.ok) throw new Error('Failed to fetch collections');

      const data = await res.json();
      setCollections(data.items);
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
  }, [pagination.page, pagination.limit, search, visibility]);

  useEffect(() => {
    fetchCollections();
  }, [fetchCollections]);

  const handleVisibilityChange = async (collectionId: string, newVisibility: string, cascadeToCards: boolean = false) => {
    try {
      const res = await fetch(`/api/admin/collections/${collectionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: newVisibility, cascadeToCards }),
      });
      if (!res.ok) throw new Error('Failed to update visibility');
      fetchCollections();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDelete = async (collectionId: string, collectionName: string, deleteCards: boolean = false) => {
    const message = deleteCards
      ? `Are you sure you want to delete "${collectionName}" AND ALL ITS CARDS? This cannot be undone.`
      : `Are you sure you want to delete "${collectionName}"? Cards will be preserved but will no longer belong to a collection.`;

    if (!confirm(message)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/collections/${collectionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deleteCards }),
      });
      if (!res.ok) throw new Error('Failed to delete collection');
      fetchCollections();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const visibilityBadge = (v: string) => {
    const styles: Record<string, string> = {
      public: 'bg-green-500/20 text-green-400',
      nsfw_only: 'bg-pink-500/20 text-pink-400',
      unlisted: 'bg-yellow-500/20 text-yellow-400',
      blocked: 'bg-red-500/20 text-red-400',
    };
    return styles[v] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-starlight">Collections</h1>
        <div className="text-sm text-starlight/60">
          {pagination.total} total collection{pagination.total !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search by name, slug, or creator..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
          className="flex-1 px-4 py-2 bg-cosmic-teal/30 border border-nebula/30 rounded-lg text-starlight placeholder:text-starlight/40 focus:outline-none focus:border-nebula"
        />
        <select
          value={visibility}
          onChange={(e) => {
            setVisibility(e.target.value as FilterVisibility);
            setPagination(prev => ({ ...prev, page: 1 }));
          }}
          className="px-4 py-2 bg-cosmic-teal/30 border border-nebula/30 rounded-lg text-starlight focus:outline-none focus:border-nebula"
        >
          <option value="all">All Visibility</option>
          <option value="public">Public</option>
          <option value="nsfw_only">NSFW Only</option>
          <option value="unlisted">Unlisted</option>
          <option value="blocked">Blocked</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg mb-4">
          {error}
        </div>
      )}

      {/* Collections Table */}
      <div className="glass rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-cosmic-teal/30 border-b border-nebula/20">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Collection</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Creator</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Visibility</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Items</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Downloads</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Uploader</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Created</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-starlight/70 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nebula/10">
            {loading && collections.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-starlight/50">
                  Loading...
                </td>
              </tr>
            ) : collections.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-starlight/50">
                  No collections found
                </td>
              </tr>
            ) : (
              collections.map((col) => (
                <tr key={col.id} className="hover:bg-cosmic-teal/20">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-16 relative flex-shrink-0 rounded overflow-hidden">
                        {col.thumbnailPath ? (
                          <Image
                            src={col.thumbnailPath}
                            alt={col.name}
                            fill
                            className="object-cover"
                          />
                        ) : (
                          <div className="w-full h-full bg-cosmic-teal/50 flex items-center justify-center">
                            <span className="text-starlight/30">?</span>
                          </div>
                        )}
                      </div>
                      <div>
                        <Link
                          href={`/collection/${col.slug}`}
                          className="font-medium text-starlight hover:text-nebula transition-colors"
                        >
                          {col.name}
                        </Link>
                        <div className="text-xs text-starlight/50">{col.slug}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-starlight/70">
                    {col.creator || '-'}
                  </td>
                  <td className="px-4 py-3">
                    <select
                      value={col.visibility}
                      onChange={(e) => {
                        const cascade = confirm('Apply visibility to all cards in this collection?');
                        handleVisibilityChange(col.id, e.target.value, cascade);
                      }}
                      className={`px-2 py-1 rounded text-xs font-medium ${visibilityBadge(col.visibility)} bg-transparent border border-current focus:outline-none`}
                    >
                      <option value="public">Public</option>
                      <option value="nsfw_only">NSFW Only</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-sm text-starlight/70">
                    {col.itemsCount}
                  </td>
                  <td className="px-4 py-3 text-sm text-starlight/70">
                    {col.downloadsCount.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {col.uploader ? (
                      <Link
                        href={`/user/${col.uploader.username}`}
                        className="text-nebula hover:underline"
                      >
                        @{col.uploader.username}
                      </Link>
                    ) : (
                      <span className="text-starlight/40">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-starlight/50">
                    {formatDate(col.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/collection/${col.slug}`}
                        className="px-2 py-1 text-xs bg-cosmic-teal/30 hover:bg-cosmic-teal/50 text-starlight rounded transition-colors"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => handleDelete(col.id, col.name, false)}
                        className="px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => handleDelete(col.id, col.name, true)}
                        className="px-2 py-1 text-xs bg-red-600/30 hover:bg-red-600/40 text-red-300 rounded transition-colors"
                        title="Delete collection and all its cards"
                      >
                        Delete All
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination.total > pagination.limit && (
        <div className="flex items-center justify-between mt-4">
          <div className="text-sm text-starlight/60">
            Showing {(pagination.page - 1) * pagination.limit + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="px-3 py-1 bg-cosmic-teal/30 hover:bg-cosmic-teal/50 text-starlight rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
              disabled={!pagination.hasMore}
              className="px-3 py-1 bg-cosmic-teal/30 hover:bg-cosmic-teal/50 text-starlight rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
