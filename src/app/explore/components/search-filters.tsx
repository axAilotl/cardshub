'use client';

import { useMemo } from 'react';
import Select, { MultiValue, StylesConfig } from 'react-select';
import { Input, Button } from '@/components/ui';
import type { SortOption } from '@/types/card';

interface TagOption {
  value: string;
  label: string;
  count?: number;
}

interface TagGroup {
  category: string;
  tags: { id: number; name: string; slug: string; category: string | null; usage_count: number }[];
}

interface SearchFiltersProps {
  tags: TagGroup[];
  search: string;
  onSearchChange: (value: string) => void;
  includeTags: string[];
  onIncludeTagsChange: (tags: string[]) => void;
  excludeTags: string[];
  onExcludeTagsChange: (tags: string[]) => void;
  sort: SortOption;
  onSortChange: (sort: SortOption) => void;
  minTokens: string;
  onMinTokensChange: (value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  hasAltGreetings: boolean;
  onHasAltGreetingsChange: (value: boolean) => void;
  hasLorebook: boolean;
  onHasLorebookChange: (value: boolean) => void;
  hasEmbeddedImages: boolean;
  onHasEmbeddedImagesChange: (value: boolean) => void;
  onSearch: () => void;
  onClear: () => void;
}

const sortOptions: { value: SortOption; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'trending', label: 'Trending' },
  { value: 'popular', label: 'Popular' },
  { value: 'downloads', label: 'Most Downloads' },
  { value: 'favorites', label: 'Most Favorites' },
];

const selectStyles: StylesConfig<TagOption, true> = {
  control: (base) => ({
    ...base,
    backgroundColor: 'rgba(30, 58, 95, 0.3)',
    borderColor: 'rgba(248, 250, 252, 0.1)',
    minHeight: '38px',
    '&:hover': {
      borderColor: 'rgb(99, 102, 241)',
    },
  }),
  menu: (base) => ({
    ...base,
    backgroundColor: 'rgb(11, 20, 38)',
    border: '1px solid rgba(248, 250, 252, 0.2)',
    zIndex: 50,
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isFocused ? 'rgba(30, 58, 95, 0.5)' : 'transparent',
    color: 'rgb(248, 250, 252)',
    '&:active': {
      backgroundColor: 'rgba(30, 58, 95, 0.7)',
    },
  }),
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: 'rgb(16, 185, 129)',
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: 'rgb(16, 185, 129)',
    '&:hover': {
      backgroundColor: 'rgba(16, 185, 129, 0.3)',
      color: 'rgb(16, 185, 129)',
    },
  }),
  input: (base) => ({
    ...base,
    color: 'rgb(248, 250, 252)',
  }),
  placeholder: (base) => ({
    ...base,
    color: 'rgba(248, 250, 252, 0.5)',
  }),
};

const excludeSelectStyles: StylesConfig<TagOption, true> = {
  ...selectStyles,
  multiValue: (base) => ({
    ...base,
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  }),
  multiValueLabel: (base) => ({
    ...base,
    color: 'rgb(248, 113, 113)',
  }),
  multiValueRemove: (base) => ({
    ...base,
    color: 'rgb(248, 113, 113)',
    '&:hover': {
      backgroundColor: 'rgba(239, 68, 68, 0.3)',
      color: 'rgb(248, 113, 113)',
    },
  }),
  menuPortal: (base) => ({
    ...base,
    zIndex: 9999,
  }),
};

export function SearchFilters({
  tags,
  search,
  onSearchChange,
  includeTags,
  onIncludeTagsChange,
  excludeTags,
  onExcludeTagsChange,
  sort,
  onSortChange,
  minTokens,
  onMinTokensChange,
  showFilters,
  onToggleFilters,
  hasAltGreetings,
  onHasAltGreetingsChange,
  hasLorebook,
  onHasLorebookChange,
  hasEmbeddedImages,
  onHasEmbeddedImagesChange,
  onSearch,
  onClear,
}: SearchFiltersProps) {
  const tagOptions: TagOption[] = useMemo(() => {
    return tags.flatMap((group) =>
      group.tags.map((tag) => ({
        value: tag.slug,
        label: tag.name,
        count: tag.usage_count,
      }))
    );
  }, [tags]);

  const selectedIncludeTags = useMemo(() => {
    return includeTags.map((slug) => {
      const option = tagOptions.find((t) => t.value === slug);
      return option || { value: slug, label: slug };
    });
  }, [includeTags, tagOptions]);

  const selectedExcludeTags = useMemo(() => {
    return excludeTags.map((slug) => {
      const option = tagOptions.find((t) => t.value === slug);
      return option || { value: slug, label: slug };
    });
  }, [excludeTags, tagOptions]);

  const handleIncludeChange = (selected: MultiValue<TagOption>) => {
    onIncludeTagsChange(selected.map((t) => t.value));
  };

  const handleExcludeChange = (selected: MultiValue<TagOption>) => {
    onExcludeTagsChange(selected.map((t) => t.value));
  };

  return (
    <div className="glass rounded-xl p-4 mb-6 space-y-4">
      {/* Line 1: Search + Sort */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <Input
            placeholder="Search by name, description, or creator..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onSearch()}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            }
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-starlight/60 whitespace-nowrap">Sort:</label>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SortOption)}
            className="bg-cosmic-teal/50 border border-starlight/10 rounded-lg px-3 py-2 text-starlight text-sm focus:outline-none focus:border-nebula"
          >
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Line 2: Include Tags, Exclude Tags, Min Tokens, Buttons */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <label className="text-xs text-starlight/60 mb-1 block">Include Tags</label>
          <Select<TagOption, true>
            instanceId="include-tags-select"
            isMulti
            options={tagOptions}
            value={selectedIncludeTags}
            onChange={handleIncludeChange}
            placeholder="Select tags to include..."
            styles={selectStyles}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
            menuPosition="fixed"
            formatOptionLabel={(option) => (
              <div className="flex justify-between items-center">
                <span>{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs opacity-50">{option.count}</span>
                )}
              </div>
            )}
          />
        </div>

        <div className="flex-1">
          <label className="text-xs text-starlight/60 mb-1 block">Exclude Tags</label>
          <Select<TagOption, true>
            instanceId="exclude-tags-select"
            isMulti
            options={tagOptions}
            value={selectedExcludeTags}
            onChange={handleExcludeChange}
            placeholder="Select tags to exclude..."
            styles={excludeSelectStyles}
            menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
            menuPosition="fixed"
            formatOptionLabel={(option) => (
              <div className="flex justify-between items-center">
                <span>{option.label}</span>
                {option.count !== undefined && (
                  <span className="text-xs opacity-50">{option.count}</span>
                )}
              </div>
            )}
          />
        </div>

        <div className="w-32">
          <label className="text-xs text-starlight/60 mb-1 block">Min Tokens</label>
          <input
            type="number"
            placeholder="0"
            value={minTokens}
            onChange={(e) => onMinTokensChange(e.target.value)}
            className="w-full bg-cosmic-teal/30 border border-starlight/10 rounded-lg px-3 py-2 text-sm text-starlight focus:outline-none focus:border-nebula h-[38px]"
          />
        </div>

        <div className="flex items-end gap-2">
          <Button onClick={onSearch} variant="primary" className="h-[38px]">
            Search
          </Button>
          <Button onClick={onClear} variant="secondary" className="h-[38px]">
            Clear
          </Button>
          <Button
            onClick={onToggleFilters}
            variant={showFilters ? 'primary' : 'secondary'}
            className="h-[38px]"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
            Filters
          </Button>
        </div>
      </div>

      {/* Line 3: Advanced Filters (collapsible) */}
      {showFilters && (
        <div className="flex flex-wrap gap-6 pt-4 border-t border-starlight/10">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasAltGreetings}
              onChange={(e) => onHasAltGreetingsChange(e.target.checked)}
              className="w-4 h-4 rounded bg-cosmic-teal/30 border-starlight/20 text-nebula focus:ring-nebula"
            />
            <span className="text-sm text-starlight">Has Alternate Greetings</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasLorebook}
              onChange={(e) => onHasLorebookChange(e.target.checked)}
              className="w-4 h-4 rounded bg-cosmic-teal/30 border-starlight/20 text-nebula focus:ring-nebula"
            />
            <span className="text-sm text-starlight">Has Lorebook</span>
          </label>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={hasEmbeddedImages}
              onChange={(e) => onHasEmbeddedImagesChange(e.target.checked)}
              className="w-4 h-4 rounded bg-cosmic-teal/30 border-starlight/20 text-nebula focus:ring-nebula"
            />
            <span className="text-sm text-starlight">Has Embedded Images</span>
          </label>
        </div>
      )}
    </div>
  );
}
