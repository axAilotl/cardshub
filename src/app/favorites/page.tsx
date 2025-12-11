'use client';

import { useState, useEffect, useCallback } from 'react';
import { AppShell } from '@/components/layout';
import { CardGrid } from '@/components/cards';
import { Pagination } from '@/components/ui';
import { useAuth } from '@/lib/auth/context';
import Link from 'next/link';
import type { CardListItem } from '@/types/card';
import { CARDS_PER_PAGE } from '@/lib/constants';

export default function FavoritesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const totalPages = Math.ceil(total / CARDS_PER_PAGE);

  const fetchFavorites = useCallback(async (pageNum: number) => {
    if (!user) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/users/${user.username}/favorites?page=${pageNum}&limit=${CARDS_PER_PAGE}`);
      if (!response.ok) {
        throw new Error('Failed to fetch favorites');
      }
      const data = await response.json();
      setCards(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load favorites');
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!authLoading && user) {
      fetchFavorites(page);
    } else if (!authLoading && !user) {
      setIsLoading(false);
    }
  }, [authLoading, user, fetchFavorites, page]);

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
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
              {total > 0
                ? `${total} card${total !== 1 ? 's' : ''} saved${totalPages > 1 ? ` • Page ${page} of ${totalPages}` : ''}`
                : 'Cards you love, all in one place'}
            </p>
          </div>
        </div>

        {/* Content */}
        {error ? (
          <div className="text-center py-16">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => fetchFavorites(1)}
              className="mt-4 px-4 py-2 bg-nebula/20 hover:bg-nebula/30 rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        ) : cards.length === 0 && !isLoading ? (
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
            <CardGrid cards={cards} isLoading={isLoading} />

            {!isLoading && totalPages > 1 && (
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={goToPage}
                className="mt-8"
              />
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
