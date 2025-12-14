'use client';

/**
 * Tag Selector Widget for AutoForm
 *
 * Adapter that wraps the existing TagChipSelector component
 * to work with the AutoForm FieldWidgetProps interface.
 */

import { useState, useEffect, useCallback } from 'react';
import type { FieldWidgetProps } from '@character-foundry/app-framework';
import { TagChipSelector, type TagInfo } from '@/components/ui/tag-chip-selector';

interface TagSelectorWidgetProps extends FieldWidgetProps<string[]> {
  variant?: 'green' | 'red' | 'blue';
}

/**
 * Extended TagInfo that includes count for display purposes.
 */
export interface TagInfoWithCount extends TagInfo {
  count?: number;
}

/**
 * Context for sharing available tags across multiple tag selector instances.
 * This avoids fetching tags multiple times on the same page.
 */
let cachedTags: TagInfoWithCount[] | null = null;
let tagsFetchPromise: Promise<TagInfoWithCount[]> | null = null;

async function fetchTags(): Promise<TagInfoWithCount[]> {
  if (cachedTags) return cachedTags;

  if (tagsFetchPromise) return tagsFetchPromise;

  tagsFetchPromise = fetch('/api/tags')
    .then((res) => res.json())
    .then((data) => {
      const tags: TagInfoWithCount[] = [];
      if (data.tags) {
        for (const category of Object.keys(data.tags)) {
          for (const tag of data.tags[category]) {
            tags.push({
              id: tag.id,
              name: tag.name,
              slug: tag.slug,
              category: category === 'uncategorized' ? null : category,
              count: tag.count,
            });
          }
        }
      }
      cachedTags = tags;
      return tags;
    })
    .catch((err) => {
      console.error('Failed to fetch tags:', err);
      tagsFetchPromise = null;
      return [];
    });

  return tagsFetchPromise;
}

/**
 * Clear the cached tags (useful for testing or forced refresh).
 */
export function clearTagsCache() {
  cachedTags = null;
  tagsFetchPromise = null;
}

/**
 * Tag Selector Widget
 *
 * Works with string[] of tag IDs as the value type.
 * Fetches available tags from the API automatically.
 */
export function TagSelectorWidget({
  value = [],
  onChange,
  name,
  label,
  error,
  disabled,
  hint,
  variant = 'blue',
}: TagSelectorWidgetProps) {
  const [availableTags, setAvailableTags] = useState<TagInfoWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch tags on mount
  useEffect(() => {
    setIsLoading(true);
    fetchTags()
      .then(setAvailableTags)
      .finally(() => setIsLoading(false));
  }, []);

  // Convert tag IDs to TagInfo objects
  const selectedTags = availableTags.filter((tag) =>
    value.includes(String(tag.id))
  );

  // Handle adding a tag
  const handleAdd = useCallback(
    (tag: TagInfo) => {
      const tagId = String(tag.id);
      if (!value.includes(tagId)) {
        onChange([...value, tagId]);
      }
    },
    [value, onChange]
  );

  // Handle removing a tag
  const handleRemove = useCallback(
    (tagId: number) => {
      onChange(value.filter((id) => id !== String(tagId)));
    },
    [value, onChange]
  );

  // Determine variant from name pattern or prop
  const effectiveVariant =
    name?.includes('blocked') || name?.includes('block')
      ? 'red'
      : name?.includes('followed') || name?.includes('follow')
        ? 'green'
        : variant;

  return (
    <div data-field data-error={error ? 'true' : undefined}>
      <TagChipSelector
        label={label || name || 'Tags'}
        description={hint?.helperText}
        selectedTags={selectedTags}
        availableTags={availableTags}
        onAdd={handleAdd}
        onRemove={handleRemove}
        variant={effectiveVariant as 'green' | 'red' | 'blue'}
        placeholder={hint?.placeholder || 'Search tags...'}
        disabled={disabled}
        isLoading={isLoading}
      />
      {error && <span data-error-message>{error}</span>}
    </div>
  );
}

/**
 * Followed Tags Widget - preset with green variant
 */
export function FollowedTagsWidget(props: FieldWidgetProps<string[]>) {
  return <TagSelectorWidget {...props} variant="green" />;
}

/**
 * Blocked Tags Widget - preset with red variant
 */
export function BlockedTagsWidget(props: FieldWidgetProps<string[]>) {
  return <TagSelectorWidget {...props} variant="red" />;
}
