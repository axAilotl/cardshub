import type { CardListItem } from './card';

/**
 * Collection - Multi-character package (e.g., Voxta)
 */
export interface Collection {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  explicitContent: boolean;

  // Voxta package metadata
  packageId: string | null;
  packageVersion: string | null;
  entryResourceKind: number | null;
  entryResourceId: string | null;
  thumbnailResourceKind: number | null;
  thumbnailResourceId: string | null;
  dateCreated: string | null;
  dateModified: string | null;

  // Storage
  storageUrl: string;

  // Display
  thumbnailPath: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;

  // Ownership
  uploaderId: string;
  visibility: 'public' | 'nsfw_only' | 'unlisted' | 'blocked';

  // Stats
  itemsCount: number;
  downloadsCount: number;

  createdAt: number;
  updatedAt: number;
}

/**
 * Collection list item for grid display
 */
export interface CollectionListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  explicitContent: boolean;
  thumbnailPath: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
  itemsCount: number;
  downloadsCount: number;
  visibility: string;
  createdAt: number;

  // Uploader info
  uploader: {
    id: string;
    username: string;
    displayName: string | null;
  };
}

/**
 * Collection detail with child cards
 */
export interface CollectionDetail extends Collection {
  uploader: {
    id: string;
    username: string;
    displayName: string | null;
  };
  items: CardListItem[];
  tags: string[]; // Aggregated from children
}

/**
 * Input for creating a collection
 */
export interface CreateCollectionInput {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  creator: string | null;
  explicitContent: boolean;

  // Voxta package metadata
  packageId: string | null;
  packageVersion: string | null;
  entryResourceKind: number | null;
  entryResourceId: string | null;
  thumbnailResourceKind: number | null;
  thumbnailResourceId: string | null;
  dateCreated: string | null;
  dateModified: string | null;

  // Storage
  storageUrl: string;

  // Display
  thumbnailPath: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;

  // Ownership
  uploaderId: string;
  visibility: 'public' | 'nsfw_only' | 'unlisted' | 'blocked';

  // Stats
  itemsCount: number;
}

/**
 * Filters for listing collections
 */
export interface CollectionFilters {
  page?: number;
  limit?: number;
  sort?: 'newest' | 'downloads' | 'items';
  includeNsfw?: boolean;
  uploaderId?: string;
}
