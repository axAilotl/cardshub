'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout';
import { CardGrid } from '@/components/cards/card-grid';
import { CardModal } from '@/components/cards/card-modal';
import { Button, Pagination } from '@/components/ui';
import { useAuth } from '@/lib/auth/context';
import type { CardListItem, PaginatedResponse } from '@/types/card';

const CARDS_PER_PAGE = 20;

export default function FeedPage() {
  const { user } = useAuth();
  const [cards, setCards] = useState<CardListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);

  const totalPages = Math.ceil(total / CARDS_PER_PAGE);

  const fetchFeed = useCallback(async (pageNum: number) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/feed?page=${pageNum}&limit=${CARDS_PER_PAGE}`);
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
  }, []);

  useEffect(() => {
    fetchFeed(page);
  }, [fetchFeed, page]);

  const goToPage = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setPage(newPage);
    }
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold gradient-text mb-2">Your Feed</h1>
          <p className="text-starlight/60">
            {user
              ? 'Cards from users and tags you follow, plus trending content'
              : 'Trending and popular character cards'}
          </p>
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
        {cards.length === 0 && !isLoading ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-xl font-semibold text-starlight mb-2">Your feed is empty</h2>
            <p className="text-starlight/60 mb-4">
              Start following users and tags to see personalized content here.
            </p>
            <div className="flex gap-3 justify-center">
              <Link href="/explore">
                <Button variant="primary">Explore Cards</Button>
              </Link>
              <Link href="/settings">
                <Button variant="secondary">Manage Tags</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
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
          </>
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
