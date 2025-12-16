'use client';

/**
 * Settings Page
 *
 * Renders settings panels from the registry.
 * Each panel is a self-contained component that manages its own state.
 */

// Disable static generation for this page (requires auth context)
export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { AppShell } from '@/components/layout';
import { useSettings } from '@/lib/settings';
import { Button } from '@/components/ui';
import {
  DisplayPreferencesPanel,
  ProfilePanel,
  TagPreferencesPanel,
} from './panels';

export default function SettingsPage() {
  const { resetSettings } = useSettings();

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold gradient-text mb-2">Settings</h1>
          <p className="text-starlight/60">
            Customize your CardsHub experience
          </p>
        </div>

        {/* Settings Panels */}
        <div className="space-y-6">
          {/* Profile Panel */}
          <ProfilePanel />

          {/* Display Preferences Panel */}
          <DisplayPreferencesPanel />

          {/* Tag Preferences Panel */}
          <TagPreferencesPanel />

          {/* Customization Guide Link */}
          <div data-settings-panel>
            <h2 data-settings-panel-title>CSS Customization</h2>
            <p className="text-sm text-text-muted mb-4">
              Learn how to customize your profile page and character card pages with CSS.
            </p>
            <Link
              href="/settings/customization"
              className="inline-flex items-center gap-2 px-4 py-2 bg-nebula/20 hover:bg-nebula/30 text-nebula rounded-lg transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
              </svg>
              View Customization Guide
            </Link>
          </div>
        </div>

        {/* Reset Button */}
        <div className="flex justify-end mt-6">
          <Button variant="ghost" onClick={resetSettings}>
            Reset Display Settings to Defaults
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
