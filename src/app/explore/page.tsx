import { Suspense } from 'react';
import { ExploreClient } from './client';
import { AppShell } from '@/components/layout';

function ExploreFallback() {
  return (
    <AppShell>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="h-8 w-64 bg-cosmic-teal/30 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-cosmic-teal/30 rounded animate-pulse" />
        </div>
        <div className="h-12 w-full bg-cosmic-teal/30 rounded-lg animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="glass-card rounded-xl overflow-hidden animate-pulse">
              <div className="aspect-[3/4] bg-cosmic-teal/50" />
              <div className="p-3 space-y-2">
                <div className="h-4 bg-cosmic-teal/50 rounded w-3/4" />
                <div className="h-3 bg-cosmic-teal/50 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

export default function ExplorePage() {
  return (
    <Suspense fallback={<ExploreFallback />}>
      <ExploreClient />
    </Suspense>
  );
}
