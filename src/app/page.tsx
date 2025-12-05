import Link from 'next/link';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui';

export default function HomePage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto text-center py-12">
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

        {/* Stats placeholder */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Characters', value: '0' },
            { label: 'Downloads', value: '0' },
            { label: 'Creators', value: '0' },
            { label: 'Tags', value: '37' },
          ].map((stat) => (
            <div key={stat.label} className="glass rounded-xl p-4">
              <div className="text-2xl font-bold gradient-text">{stat.value}</div>
              <div className="text-starlight/60 text-sm">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
