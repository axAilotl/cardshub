'use client';

/**
 * Tag Preferences Panel
 *
 * Manages followed and blocked tags.
 * Uses custom TagChipSelector components for selection.
 * Values are stored via API (/api/users/me/tags).
 */

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/context';
import { settingsRegistry } from '@/lib/settings/registry';
import { TagChipSelector, type TagInfo } from '@/components/ui';

interface TagInfoWithCount extends TagInfo {
  usage_count: number;
}

interface TagPreference {
  tagId: number;
  tagName: string;
  tagSlug: string;
  preference: 'follow' | 'block';
}

export function TagPreferencesPanel() {
  const { user } = useAuth();
  const panel = settingsRegistry.getPanel('tags');

  const [allTags, setAllTags] = useState<TagInfoWithCount[]>([]);
  const [preferences, setPreferences] = useState<TagPreference[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!user) return;

    async function fetchData() {
      try {
        const [tagsRes, prefsRes] = await Promise.all([
          fetch('/api/tags'),
          fetch('/api/users/me/tags'),
        ]);

        if (tagsRes.ok) {
          const data = await tagsRes.json();
          const tags: TagInfoWithCount[] = [];
          for (const group of data) {
            tags.push(...group.tags);
          }
          setAllTags(tags);
        }

        if (prefsRes.ok) {
          const data = await prefsRes.json();
          const prefs: TagPreference[] = [];
          for (const tag of data.followed || []) {
            prefs.push({ tagId: tag.id, tagName: tag.name, tagSlug: tag.slug, preference: 'follow' });
          }
          for (const tag of data.blocked || []) {
            prefs.push({ tagId: tag.id, tagName: tag.name, tagSlug: tag.slug, preference: 'block' });
          }
          setPreferences(prefs);
        }
      } catch (err) {
        console.error('Error fetching tag data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, [user]);

  // Convert preferences to TagInfo arrays for the selectors
  const followedTags = useMemo(() =>
    preferences
      .filter(p => p.preference === 'follow')
      .map(p => ({ id: p.tagId, name: p.tagName, slug: p.tagSlug, category: null })),
    [preferences]
  );

  const blockedTags = useMemo(() =>
    preferences
      .filter(p => p.preference === 'block')
      .map(p => ({ id: p.tagId, name: p.tagName, slug: p.tagSlug, category: null })),
    [preferences]
  );

  // Available tags excluding already preferenced ones
  const availableForFollow = useMemo(() => {
    const blockedIds = new Set(blockedTags.map(t => t.id));
    const followedIds = new Set(followedTags.map(t => t.id));
    return allTags.filter(t => !blockedIds.has(t.id) && !followedIds.has(t.id));
  }, [allTags, blockedTags, followedTags]);

  const availableForBlock = useMemo(() => {
    const blockedIds = new Set(blockedTags.map(t => t.id));
    const followedIds = new Set(followedTags.map(t => t.id));
    return allTags.filter(t => !blockedIds.has(t.id) && !followedIds.has(t.id));
  }, [allTags, blockedTags, followedTags]);

  const updatePreference = useCallback(async (
    tagId: number,
    tagName: string,
    tagSlug: string,
    preference: 'follow' | 'block' | null
  ) => {
    setIsSaving(true);
    try {
      const res = await fetch('/api/users/me/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagId, preference }),
      });

      if (res.ok) {
        if (preference === null) {
          setPreferences(prev => prev.filter(p => p.tagId !== tagId));
        } else {
          const existing = preferences.find(p => p.tagId === tagId);
          if (existing) {
            setPreferences(prev => prev.map(p =>
              p.tagId === tagId ? { ...p, preference } : p
            ));
          } else {
            setPreferences(prev => [...prev, { tagId, tagName, tagSlug, preference }]);
          }
        }
      }
    } catch (err) {
      console.error('Error updating preference:', err);
    } finally {
      setIsSaving(false);
    }
  }, [preferences]);

  const handleFollowAdd = useCallback((tag: TagInfo) => {
    updatePreference(tag.id, tag.name, tag.slug, 'follow');
  }, [updatePreference]);

  const handleFollowRemove = useCallback((tagId: number) => {
    const pref = preferences.find(p => p.tagId === tagId);
    if (pref) {
      updatePreference(tagId, pref.tagName, pref.tagSlug, null);
    }
  }, [preferences, updatePreference]);

  const handleBlockAdd = useCallback((tag: TagInfo) => {
    updatePreference(tag.id, tag.name, tag.slug, 'block');
  }, [updatePreference]);

  const handleBlockRemove = useCallback((tagId: number) => {
    const pref = preferences.find(p => p.tagId === tagId);
    if (pref) {
      updatePreference(tagId, pref.tagName, pref.tagSlug, null);
    }
  }, [preferences, updatePreference]);

  if (!panel) return null;

  // Not logged in
  if (!user) {
    return (
      <div data-settings-panel>
        <h2 data-settings-panel-title>{panel.title}</h2>
        <div className="text-center py-4">
          <p className="text-starlight/70 mb-3">Log in to manage tag preferences</p>
          <Link
            href="/login"
            className="inline-block px-4 py-2 bg-nebula hover:bg-nebula/80 text-white rounded-lg transition-colors"
          >
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div data-settings-panel>
      <h2 data-settings-panel-title>{panel.title}</h2>
      {panel.description && (
        <p className="text-sm text-text-muted mb-4">{panel.description}</p>
      )}

      <div className="space-y-8">
        <TagChipSelector
          label="Followed Tags"
          description="Cards with these tags will appear in your personalized feed"
          selectedTags={followedTags}
          availableTags={availableForFollow}
          onAdd={handleFollowAdd}
          onRemove={handleFollowRemove}
          variant="green"
          placeholder="Search tags to follow..."
          disabled={isSaving}
          isLoading={isLoading}
        />

        <TagChipSelector
          label="Blocked Tags"
          description="Cards with these tags will be hidden from your feed"
          selectedTags={blockedTags}
          availableTags={availableForBlock}
          onAdd={handleBlockAdd}
          onRemove={handleBlockRemove}
          variant="red"
          placeholder="Search tags to block..."
          disabled={isSaving}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
