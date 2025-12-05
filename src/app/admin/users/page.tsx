'use client';

import { useEffect, useState, useCallback } from 'react';

interface AdminUser {
  id: string;
  username: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  cardsCount: number;
  commentsCount: number;
  createdAt: number;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (search) params.set('search', search);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error('Failed to fetch users');

      const data = await res.json();
      setUsers(data.items);
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
  }, [pagination.page, pagination.limit, search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    const action = currentIsAdmin ? 'remove admin privileges from' : 'grant admin privileges to';
    if (!confirm(`Are you sure you want to ${action} this user?`)) return;

    try {
      const res = await fetch(`/api/admin/users/${userId}/admin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isAdmin: !currentIsAdmin }),
      });
      if (!res.ok) throw new Error('Failed to update user');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const handleDeleteUser = async (userId: string, username: string) => {
    if (!confirm(`Are you sure you want to delete user "${username}"? This will also delete all their cards and comments.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete user');
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-starlight">Users Management</h1>
      </div>

      {/* Search */}
      <div className="bg-cosmic-teal/30 rounded-lg p-4 border border-nebula/20">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by username or email..."
              className="w-full px-3 py-2 bg-deep-space border border-nebula/30 rounded-lg text-starlight placeholder:text-starlight/50 focus:outline-none focus:border-nebula"
            />
          </div>
          <button
            onClick={() => setSearch('')}
            className="px-4 py-2 bg-nebula/20 hover:bg-nebula/30 text-starlight rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Users Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-nebula"></div>
        </div>
      ) : error ? (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4">
          <p className="text-red-400">Error: {error}</p>
        </div>
      ) : (
        <>
          <div className="bg-cosmic-teal/30 rounded-lg border border-nebula/20 overflow-hidden">
            <table className="w-full">
              <thead className="bg-deep-space/50">
                <tr>
                  <th className="px-4 py-3 text-left text-sm font-medium text-starlight/70">User</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-starlight/70">Email</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-starlight/70">Role</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-starlight/70">Cards</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-starlight/70">Comments</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-starlight/70">Joined</th>
                  <th className="px-4 py-3 text-right text-sm font-medium text-starlight/70">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-nebula/10">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-nebula/5 transition-colors">
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-starlight">{user.username}</p>
                        {user.displayName && (
                          <p className="text-xs text-starlight/50">{user.displayName}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-starlight/70">
                      {user.email || <span className="text-starlight/30">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {user.isAdmin ? (
                        <span className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-medium">
                          Admin
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
                          User
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-starlight/70">
                      {user.cardsCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-starlight/70">
                      {user.commentsCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-starlight/70">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            user.isAdmin
                              ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-400'
                              : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                          }`}
                        >
                          {user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.username)}
                          className="p-1.5 hover:bg-red-500/20 rounded transition-colors text-red-400"
                          title="Delete User"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-starlight/70">
              Showing {users.length} of {pagination.total} users
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
