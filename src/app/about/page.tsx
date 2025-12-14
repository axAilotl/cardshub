'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui';

interface PlatformStats {
  totalCards: number;
  totalUsers: number;
  totalDownloads: number;
  totalCreators: number;
}

function StatCounter({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      <div className="text-4xl md:text-5xl font-bold gradient-text mb-2">
        {value.toLocaleString()}
      </div>
      <div className="text-starlight/60 text-sm uppercase tracking-wide">{label}</div>
    </div>
  );
}

export default function AboutPage() {
  const [stats, setStats] = useState<PlatformStats | null>(null);

  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.ok ? res.json() : null)
      .then(data => setStats(data))
      .catch(() => {});
  }, []);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto text-center py-12">
        {/* Prototype Warning Banner */}
        <div className="mb-8 p-4 rounded-xl bg-amber-500/20 border border-amber-500/40">
          <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold mb-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Prototype / Testing Instance
          </div>
          <p className="text-starlight/70 text-sm">
            This is a prototype for a federated character cards hosting platform.
            <span className="text-amber-400/90 font-medium"> Data may be wiped at any time</span> without notice.
            Do not use this as your primary storage.
          </p>
          <a
            href="https://github.com/axAilotl/character-federation"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-3 text-sm text-nebula hover:text-aurora transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.17 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.167 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
            </svg>
            View on GitHub
          </a>
        </div>

        {/* Hero */}
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          <span className="gradient-text">CardsHub</span>
        </h1>
        <p className="text-xl md:text-2xl text-starlight/80 mb-4">
          Share and Discover AI Character Cards
        </p>
        <p className="text-starlight/60 mb-8 max-w-2xl mx-auto">
          Upload, explore, and download character cards for your favorite AI platforms.
          Support for CCv2 and CCv3 formats with automatic token counting and metadata extraction.
        </p>

        {/* Stats counters */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12 glass rounded-xl p-6">
            <StatCounter value={stats.totalCards} label="Characters" />
            <StatCounter value={stats.totalCreators} label="Creators" />
            <StatCounter value={stats.totalDownloads} label="Downloads" />
            <StatCounter value={stats.totalUsers} label="Users" />
          </div>
        )}

        {/* CTA buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <Link href="/explore">
            <Button size="lg" variant="primary">
              Explore Characters
            </Button>
          </Link>
          <Link href="/upload">
            <Button size="lg" variant="outline">
              Upload Card
            </Button>
          </Link>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 text-left">
          <div className="glass rounded-xl p-6">
            <div className="w-12 h-12 cosmic-gradient rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Token Counting</h3>
            <p className="text-starlight/60 text-sm">
              Automatic token counting for all card fields using tiktoken. Know exactly how much context each character uses.
            </p>
          </div>

          <div className="glass rounded-xl p-6">
            <div className="w-12 h-12 cosmic-gradient rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">CCv2 & CCv3 Support</h3>
            <p className="text-starlight/60 text-sm">
              Full support for Character Card Spec v2 and v3, including lorebooks, alternate greetings, and assets.
            </p>
          </div>

          <div className="glass rounded-xl p-6">
            <div className="w-12 h-12 cosmic-gradient rounded-lg flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="font-semibold text-lg mb-2">Image Detection</h3>
            <p className="text-starlight/60 text-sm">
              Automatically detects embedded images in card text, lorebooks, and alternate greetings.
            </p>
          </div>
        </div>

        {/* Additional features */}
        <div className="mt-12 grid md:grid-cols-2 gap-8 text-left">
          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold text-lg mb-2">Multi-Format Support</h3>
            <p className="text-starlight/60 text-sm mb-3">
              Upload and download cards in multiple formats:
            </p>
            <ul className="text-starlight/60 text-sm space-y-1">
              <li>PNG with embedded card data</li>
              <li>JSON raw card files</li>
              <li>CharX packages (.charx)</li>
              <li>Voxta packages (.voxpkg)</li>
            </ul>
          </div>

          <div className="glass rounded-xl p-6">
            <h3 className="font-semibold text-lg mb-2">Community Features</h3>
            <p className="text-starlight/60 text-sm mb-3">
              Engage with the community:
            </p>
            <ul className="text-starlight/60 text-sm space-y-1">
              <li>Follow your favorite creators</li>
              <li>Personalized feed based on interests</li>
              <li>Tag-based discovery and filtering</li>
              <li>Save favorites for quick access</li>
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
