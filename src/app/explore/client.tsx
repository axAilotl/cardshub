'use client';

import { useState } from 'react';
import { AppShell } from '@/components/layout';
import { CardGrid, CardModal } from '@/components/cards';
import { Pagination } from '@/components/ui';
import { SearchFilters } from './components/search-filters';
import { useCardSearch } from './hooks/use-card-search';
import type { CardListItem } from '@/types/card';

export function ExploreClient() {
  const {
    cards,
    tags,
    isLoading,
    total,
    page,
    totalPages,
    goToPage,
    search,
    setSearch,
    includeTags,
    setIncludeTags,
    excludeTags,
    setExcludeTags,
    sort,
    setSort,
    minTokens,
    setMinTokens,
    hasAltGreetings,
    setHasAltGreetings,
    hasLorebook,
    setHasLorebook,
    hasEmbeddedImages,
    setHasEmbeddedImages,
    handleSearch,
    handleClear,
    hasActiveFilters,
  } = useCardSearch();

  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleQuickView = (card: CardListItem) => {
    setSelectedCard(card);
    setIsModalOpen(true);
  };

  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold gradient-text mb-2">Explore Characters</h1>
          <p className="text-starlight/60">
            Discover and download AI character cards created by the community
          </p>
        </div>

        {/* Search Controls */}
        <SearchFilters
          tags={tags}
          search={search}
          onSearchChange={setSearch}
          includeTags={includeTags}
          onIncludeTagsChange={setIncludeTags}
          excludeTags={excludeTags}
          onExcludeTagsChange={setExcludeTags}
          sort={sort}
          onSortChange={setSort}
          minTokens={minTokens}
          onMinTokensChange={setMinTokens}
          showFilters={showFilters}
          onToggleFilters={() => setShowFilters(!showFilters)}
          hasAltGreetings={hasAltGreetings}
          onHasAltGreetingsChange={setHasAltGreetings}
          hasLorebook={hasLorebook}
          onHasLorebookChange={setHasLorebook}
          hasEmbeddedImages={hasEmbeddedImages}
          onHasEmbeddedImagesChange={setHasEmbeddedImages}
          onSearch={handleSearch}
          onClear={handleClear}
        />

        {/* Results count and page info */}
        {!isLoading && (
          <div className="mb-4 flex items-center justify-between text-sm text-starlight/60">
            <div>
              {total} {total === 1 ? 'character' : 'characters'} found
              {totalPages > 1 && ` • Page ${page} of ${totalPages}`}
              {hasActiveFilters && (
                <button onClick={handleClear} className="ml-2 text-nebula hover:text-nebula/80">
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {/* Card Grid */}
        <CardGrid
          cards={cards}
          isLoading={isLoading}
          onQuickView={handleQuickView}
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

        {/* Loading indicator */}
        {isLoading && (
          <div className="mt-8 text-center">
            <div className="inline-flex items-center gap-2 text-starlight/60">
              <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Loading...
            </div>
          </div>
        )}
      </div>

      {/* Quick view modal */}
      <CardModal
        card={selectedCard}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </AppShell>
  );
}
