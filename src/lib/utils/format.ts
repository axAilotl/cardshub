/**
 * Shared formatting utilities
 * Single source of truth for date formatting, number formatting, etc.
 */

/**
 * Format a Unix timestamp to a readable date string
 */
export function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Format a Unix timestamp to month and year only (e.g., "January 2024")
 * Used for "Joined" dates on user profiles
 */
export function formatMonthYear(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
  });
}

/**
 * Format a count with K/M suffixes for large numbers
 */
export function formatCount(count: number): string {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * Strip HTML tags from a string
 * Also removes style/script tags with their content
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '') // Remove style tags with content
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // Remove script tags with content
    .replace(/<[^>]*>/g, '') // Remove remaining HTML tags
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();
}
