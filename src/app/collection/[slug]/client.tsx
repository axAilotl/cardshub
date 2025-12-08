'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AppShell } from '@/components/layout';
import { CardGrid, CardModal } from '@/components/cards';
import { Badge } from '@/components/ui';
import type { CollectionDetail } from '@/types/collection';
import type { CardListItem } from '@/types/card';
import { formatCount } from '@/lib/utils/format';

interface CollectionDetailClientProps {
  collection: CollectionDetail;
}

export function CollectionDetailClient({ collection }: CollectionDetailClientProps) {
  const [selectedCard, setSelectedCard] = useState<CardListItem | null>(null);

  const handleDownload = async () => {
    const response = await fetch(`/api/collections/${collection.slug}/download`);
    if (response.ok) {
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${collection.slug}.voxpkg`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <AppShell>
      {/* Hero Section */}
      <div className="glass rounded-xl overflow-hidden mb-8">
        <div className="flex flex-col md:flex-row gap-6 p-6">
          {/* Thumbnail */}
          <div className="flex-shrink-0 w-full md:w-64">
            <div className="relative aspect-[3/4] rounded-lg overflow-hidden">
              {collection.thumbnailPath ? (
                <Image
                  src={collection.thumbnailPath}
                  alt={collection.name}
                  fill
                  className="object-cover"
                  priority
                />
              ) : (
                <div className="w-full h-full bg-cosmic-teal/50 flex items-center justify-center">
                  <span className="text-6xl text-starlight/30">?</span>
                </div>
              )}

              {/* Collection badge overlay */}
              <div className="absolute top-2 right-2">
                <Badge variant="default">COLLECTION</Badge>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="flex-grow">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold text-starlight mb-2">
                  {collection.name}
                </h1>

                {collection.creator && (
                  <p className="text-starlight/70 mb-1">
                    by {collection.creator}
                  </p>
                )}

                {collection.uploader && (
                  <p className="text-sm text-starlight/60 mb-4">
                    Uploaded by{' '}
                    <Link
                      href={`/user/${collection.uploader.username}`}
                      className="text-nebula hover:underline"
                    >
                      @{collection.uploader.username}
                    </Link>
                  </p>
                )}
              </div>

              {/* Download button */}
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-4 py-2 bg-nebula hover:bg-aurora text-white rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>.voxpkg</span>
              </button>
            </div>

            {collection.description && (
              <p className="text-starlight/80 mb-4 whitespace-pre-wrap">
                {collection.description}
              </p>
            )}

            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2 text-starlight/70">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>{collection.itemsCount} character{collection.itemsCount !== 1 ? 's' : ''}</span>
              </div>

              <div className="flex items-center gap-2 text-starlight/70">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>{formatCount(collection.downloadsCount)} downloads</span>
              </div>

              {collection.explicitContent && (
                <Badge variant="warning">NSFW</Badge>
              )}

              {collection.packageVersion && (
                <div className="text-starlight/50">
                  v{collection.packageVersion}
                </div>
              )}
            </div>

            {/* Voxta package info */}
            {collection.dateModified && (
              <div className="mt-4 pt-4 border-t border-starlight/10 text-xs text-starlight/50">
                Package modified: {new Date(collection.dateModified).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Characters Section */}
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-starlight mb-4">
          Characters in this Collection
        </h2>

        <CardGrid
          cards={collection.items}
          onQuickView={(card) => setSelectedCard(card)}
        />
      </div>

      {/* Card Modal */}
      <CardModal
        card={selectedCard}
        isOpen={!!selectedCard}
        onClose={() => setSelectedCard(null)}
      />
    </AppShell>
  );
}
