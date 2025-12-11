'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout';
import { CardGrid } from '@/components/cards/card-grid';
import { CardModal } from '@/components/cards/card-modal';
import { Pagination } from '@/components/ui';
import { FeedSortControls, type FeedSortOption, type SortOrder } from '@/components/feed';
import { useAuth } from '@/lib/auth/context';
import type { CardListItem, PaginatedResponse } from '@/types/card';
import { CARDS_PER_PAGE } from '@/lib/constants';

export default function FeedPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [sort, setSort] = useState<FeedSortOption>('newest');
  const [order, setOrder] = useState<SortOrder>('desc');
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);

  const totalPages = Math.ceil(total / CARDS_PER_PAGE);

  const fetchFeed = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: CARDS_PER_PAGE.toString(),
        sort,
        order,
      });
      const res = await fetch(`/api/feed?${params}`);
      if (res.ok) {
        const data: PaginatedResponse<CardListItem> = await res.json();
        setCards(data.items);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Error fetching feed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [sort, order]);

  useEffect(() => {
    fetchFeed(page);
  }, [fetchFeed, page]);

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  const handleSortChange = (newSort: FeedSortOption) => {
    setSort(newSort);
    setPage(1);
  };

  const handleOrderChange = (newOrder: SortOrder) => {
    setOrder(newOrder);
    setPage(1);
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div>
              <h1 className="text-3xl font-bold gradient-text mb-2">Your Feed</h1>
              <p className="text-starlight/60">
                {user
                  ? 'Cards from users and tags you follow, plus trending content'
                  : 'Trending and popular character cards'}
              </p>
            </div>
          </div>

          {/* Sort controls */}
          <FeedSortControls
            sort={sort}
            order={order}
            onSortChange={handleSortChange}
            onOrderChange={handleOrderChange}
            showForYou={!!user}
          />
        </div>

        {/* Personalization hint for non-logged in users */}
        {!user && (
          <div className="mb-6 p-4 glass rounded-lg border border-nebula/30">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 text-nebula flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-starlight">Want a personalized feed?</p>
                <p className="text-sm text-starlight/60">
                  <Link href="/login" className="text-nebula hover:underline">Log in</Link> to follow users and tags, and see content tailored to your interests.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Results count */}
        {!isLoading && (
          <div className="mb-4 text-sm text-starlight/60">
            {total} {total === 1 ? 'character' : 'characters'} found
            {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
          </div>
        )}

        {/* Feed grid - uses same CardGrid component as explore */}
        <CardGrid
          cards={cards}
          isLoading={isLoading}
          onQuickView={setSelectedCard}
        />

        {/* Pagination */}
        {!isLoading && totalPages > 1 && (
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={goToPage}
            className="mt-8"
          />
        )}

        {/* Card Modal */}
        <CardModal
          card={selectedCard}
          isOpen={!!selectedCard}
          onClose={() => setSelectedCard(null)}
        />
      </div>
    </AppShell>
  );
}
