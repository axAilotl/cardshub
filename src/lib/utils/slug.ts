import { nanoid } from 'nanoid';

/**
 * Generate a URL-safe slug from a name
 */
export function generateSlug(name: string): string {
  const baseSlug = name
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove special characters except hyphens
    .replace(/[^a-z0-9-]/g, '')
    // Remove multiple consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-|-$/g, '')
    // Truncate to reasonable length
    .slice(0, 50);

  // Add random suffix for uniqueness
  const suffix = nanoid(6);

  return baseSlug ? `${baseSlug}-${suffix}` : suffix;
}

/**
 * Generate a unique ID
 */
export function generateId(): string {
  return nanoid(21);
}
