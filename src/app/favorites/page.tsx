'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout';
import { CardGrid } from '@/components/cards';
import { useAuth } from '@/lib/auth/context';
import Link from 'next/link';
import type { CardListItem } from '@/types/card';

export default function FavoritesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);

  const fetchFavorites = useCallback(async (pageNum: number) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${user.username}/favorites?page=${pageNum}&limit=24`);
      if (!response.ok) {
        throw new Error('Failed to fetch favorites');
      }
      const data = await response.json();

      if (pageNum === 1) {
        setCards(data.items);
      } else {
        setCards(prev => [...prev, ...data.items]);
      }
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load favorites');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchFavorites(1);
    } else if (!authLoading && !user) {
      setIsLoading(false);
    }
  }, [authLoading, user, fetchFavorites]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchFavorites(nextPage);
  };

  // Not logged in
  if (!authLoading && !user) {
    return (
      <AppShell>
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-nebula/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-nebula" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-4">Your Favorites</h1>
          <p className="text-starlight/60 mb-6">
            Login to save and access your favorite character cards.
          </p>
          <Link
            href="/login?redirect=/favorites"
            className="inline-flex items-center gap-2 px-6 py-3 bg-nebula hover:bg-nebula/80 text-white rounded-lg font-medium transition-colors"
          >
            Login to Continue
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold gradient-text">Your Favorites</h1>
            <p className="text-starlight/60 mt-1">
              {total > 0 ? `${total} card${total !== 1 ? 's' : ''} saved` : 'Cards you love, all in one place'}
            </p>
          </div>
        </div>

        {/* Content */}
        {isLoading && cards.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="glass-card rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-[3/4] bg-cosmic-teal/50" />
                <div className="p-3 space-y-2">
                  <div className="h-4 bg-cosmic-teal/50 rounded w-3/4" />
                  <div className="h-3 bg-cosmic-teal/50 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => fetchFavorites(1)}
              className="mt-4 px-4 py-2 bg-nebula/20 hover:bg-nebula/30 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : cards.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-nebula/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-starlight/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">No favorites yet</h2>
            <p className="text-starlight/60 mb-6">
              Start exploring and click the heart icon to save cards you like.
            </p>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-6 py-3 bg-nebula hover:bg-nebula/80 text-white rounded-lg font-medium transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              Explore Cards
            </Link>
          </div>
        ) : (
          <>
            <CardGrid cards={cards} />

            {hasMore && (
              <div className="text-center pt-6">
                <button
                  onClick={loadMore}
                  disabled={isLoading}
                  className="px-6 py-3 bg-nebula/20 hover:bg-nebula/30 rounded-lg font-medium transition-colors disabled:opacity-50"
                >
                  {isLoading ? 'Loading...' : 'Load More'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
