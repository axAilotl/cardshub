'use client';

/**
 * CSS Customization Guide Page
 *
 * Documentation for creators on how to customize their profile and card pages.
 */

import { AppShell } from '@/components/layout';
import Link from 'next/link';

export default function CustomizationGuidePage() {
  return (
    <AppShell>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/settings" className="text-nebula hover:underline text-sm mb-2 inline-block">
            ← Back to Settings
          </Link>
          <h1 className="text-3xl font-bold gradient-text mb-2">CSS Customization Guide</h1>
          <p className="text-starlight/60">
            Learn how to customize your profile page and character card pages with custom CSS.
          </p>
        </div>

        <div className="space-y-8">
          {/* Profile Customization */}
          <section className="glass rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 gradient-text">Profile Page Customization</h2>
            <p className="text-starlight/80 mb-4">
              Customize your profile page by adding CSS in{' '}
              <Link href="/settings/profile" className="text-nebula hover:underline">
                Settings → Profile → Custom Profile CSS
              </Link>
              . Maximum 10,000 characters.
            </p>

            <h3 className="text-lg font-medium mb-3 text-starlight">Available Selectors</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-nebula/20">
                    <th className="text-left py-2 px-3 text-starlight/70">Selector</th>
                    <th className="text-left py-2 px-3 text-starlight/70">Description</th>
                  </tr>
                </thead>
                <tbody className="text-starlight/80">
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile]</td>
                    <td className="py-2 px-3">Main profile container</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-header]</td>
                    <td className="py-2 px-3">Header section with avatar and info</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-avatar]</td>
                    <td className="py-2 px-3">Avatar container</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-info]</td>
                    <td className="py-2 px-3">Info section (name, bio, stats)</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-displayname]</td>
                    <td className="py-2 px-3">Display name heading</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-bio]</td>
                    <td className="py-2 px-3">Bio paragraph</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-stats]</td>
                    <td className="py-2 px-3">Stats container</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-stat=&quot;followers&quot;]</td>
                    <td className="py-2 px-3">Individual stat (followers, cards, downloads, upvotes)</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-tabs]</td>
                    <td className="py-2 px-3">Tab navigation</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-profile-content]</td>
                    <td className="py-2 px-3">Main content area (card grid)</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-main-content]</td>
                    <td className="py-2 px-3">Full page content (excludes sidebar and header)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-medium mt-6 mb-3 text-starlight">Example</h3>
            <pre className="bg-surface-1 p-4 rounded-lg overflow-x-auto text-xs text-starlight/80">
{`/* Neon glow avatar */
[data-profile-avatar] {
  border: 3px solid var(--bi-pink) !important;
  box-shadow: 0 0 20px rgba(217, 70, 239, 0.5);
}

/* Gradient header */
[data-profile-header] {
  background: linear-gradient(135deg, #1a1a2e, #16213e) !important;
}

/* Animated stat values */
[data-stat-value] {
  color: var(--bi-pink) !important;
  animation: pulse 2s infinite;
}`}
            </pre>
          </section>

          {/* Card Page Customization */}
          <section className="glass rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 gradient-text">Character Card Page Customization</h2>
            <p className="text-starlight/80 mb-4">
              Card creators can add custom CSS by embedding <code className="bg-surface-1 px-1 rounded">&lt;style&gt;</code> tags
              in the <strong>Creator Notes</strong> field. The CSS is extracted and applied to the card detail page.
            </p>

            <h3 className="text-lg font-medium mb-3 text-starlight">Available Selectors</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-nebula/20">
                    <th className="text-left py-2 px-3 text-starlight/70">Selector</th>
                    <th className="text-left py-2 px-3 text-starlight/70">Description</th>
                  </tr>
                </thead>
                <tbody className="text-starlight/80">
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-page]</td>
                    <td className="py-2 px-3">Main card page container</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-hero]</td>
                    <td className="py-2 px-3">Hero section with image and info</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-image]</td>
                    <td className="py-2 px-3">Card thumbnail image</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-name]</td>
                    <td className="py-2 px-3">Character name heading</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-creator]</td>
                    <td className="py-2 px-3">Creator byline</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-description]</td>
                    <td className="py-2 px-3">Description text</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-tags]</td>
                    <td className="py-2 px-3">Tags container</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-stats]</td>
                    <td className="py-2 px-3">Stats row (votes, downloads, etc.)</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-tokens]</td>
                    <td className="py-2 px-3">Token breakdown box</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-section=&quot;notes&quot;]</td>
                    <td className="py-2 px-3">Active section (notes, character, greetings, etc.)</td>
                  </tr>
                  <tr className="border-b border-nebula/10">
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-card-content]</td>
                    <td className="py-2 px-3">Content area wrapper</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-3 font-mono text-xs text-nebula">[data-main-content]</td>
                    <td className="py-2 px-3">Full page content (excludes sidebar and header)</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-lg font-medium mt-6 mb-3 text-starlight">Example (in Creator Notes)</h3>
            <pre className="bg-surface-1 p-4 rounded-lg overflow-x-auto text-xs text-starlight/80">
{`<style>
/* Gold theme for this character */
[data-card-image] {
  border: 2px solid #ffd700 !important;
  box-shadow: 0 0 30px rgba(255, 215, 0, 0.3) !important;
}

[data-card-name] {
  background: linear-gradient(90deg, #ffd700, #ffed4a);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

[data-card-tags] a {
  background: rgba(255, 215, 0, 0.2) !important;
  color: #ffd700 !important;
}
</style>

Welcome to my character! Here's what you need to know...`}
            </pre>
          </section>

          {/* CSS Variables */}
          <section className="glass rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 gradient-text">Available CSS Variables</h2>
            <p className="text-starlight/80 mb-4">
              Use these built-in CSS variables for consistency with the site theme:
            </p>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <h3 className="text-sm font-medium mb-2 text-starlight/70">Colors</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ background: '#0d0d1a' }}></div>
                    <code className="text-xs text-nebula">--deep-space</code>
                    <span className="text-starlight/60">#0d0d1a</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ background: '#151528' }}></div>
                    <code className="text-xs text-nebula">--cosmic-teal</code>
                    <span className="text-starlight/60">#151528</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded border border-nebula/20" style={{ background: '#f0f0ff' }}></div>
                    <code className="text-xs text-nebula">--starlight</code>
                    <span className="text-starlight/60">#f0f0ff</span>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium mb-2 text-starlight/70">Accents</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ background: '#d946ef' }}></div>
                    <code className="text-xs text-nebula">--bi-pink / --nebula</code>
                    <span className="text-starlight/60">#d946ef</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ background: '#8b5cf6' }}></div>
                    <code className="text-xs text-nebula">--bi-purple</code>
                    <span className="text-starlight/60">#8b5cf6</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 rounded" style={{ background: '#3b82f6' }}></div>
                    <code className="text-xs text-nebula">--bi-blue / --aurora</code>
                    <span className="text-starlight/60">#3b82f6</span>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-medium mt-4 mb-2 text-starlight/70">Surfaces</h3>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: '#1a1a2e' }}></div>
                <code className="text-xs text-nebula">--surface-1</code>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: '#252542' }}></div>
                <code className="text-xs text-nebula">--surface-2</code>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: '#2f2f52' }}></div>
                <code className="text-xs text-nebula">--surface-3</code>
              </div>
            </div>
          </section>

          {/* Utility Classes */}
          <section className="glass rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 gradient-text">Utility Classes</h2>
            <p className="text-starlight/80 mb-4">
              These utility classes are available globally:
            </p>

            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-nebula">.gradient-text</code>
                  <span className="text-starlight/60">Pink→purple→blue gradient text</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-nebula">.cosmic-gradient</code>
                  <span className="text-starlight/60">Gradient background</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-nebula">.glass</code>
                  <span className="text-starlight/60">Glassmorphism effect</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <code className="text-xs text-nebula">.nebula-glow</code>
                  <span className="text-starlight/60">Pink glow shadow</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-nebula">.aurora-glow</code>
                  <span className="text-starlight/60">Blue glow shadow</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-xs text-nebula">.bi-glow</code>
                  <span className="text-starlight/60">Dual pink/blue glow</span>
                </div>
              </div>
            </div>
          </section>

          {/* Security Notes */}
          <section className="glass rounded-xl p-6 border-l-4 border-solar">
            <h2 className="text-xl font-semibold mb-4 text-solar">Security Notes</h2>
            <ul className="space-y-2 text-starlight/80">
              <li className="flex items-start gap-2">
                <span className="text-solar">•</span>
                <span><strong>CSS Only:</strong> JavaScript will not be executed</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-solar">•</span>
                <span><strong>Scoped:</strong> Your CSS only affects your own profile or card page</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-solar">•</span>
                <span><strong>No External Resources:</strong> @import and url() to external domains are blocked</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-solar">•</span>
                <span><strong>Max Length:</strong> Profile CSS limited to 10,000 characters</span>
              </li>
            </ul>
          </section>

          {/* Tips */}
          <section className="glass rounded-xl p-6">
            <h2 className="text-xl font-semibold mb-4 gradient-text">Tips</h2>
            <ul className="space-y-3 text-starlight/80">
              <li className="flex items-start gap-2">
                <span className="text-nebula">1.</span>
                <span>Use your browser&apos;s DevTools (F12) to inspect elements and find selectors</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-nebula">2.</span>
                <span>You may need <code className="bg-surface-1 px-1 rounded text-xs">!important</code> to override default styles</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-nebula">3.</span>
                <span>Add transitions for smooth hover effects: <code className="bg-surface-1 px-1 rounded text-xs">transition: all 0.3s ease</code></span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-nebula">4.</span>
                <span>Test on mobile devices using responsive design mode</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-nebula">5.</span>
                <span>Ensure sufficient color contrast for accessibility</span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
