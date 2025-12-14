/**
 * Drizzle ORM Query Helpers
 *
 * Type-safe Drizzle queries for common operations.
 * Complex queries with dynamic JOINs/filters remain in cards.ts as raw SQL.
 *
 * Usage:
 * ```typescript
 * import { drizzleGetAllTags, drizzleGetUserVote } from '@/lib/db/drizzle-queries';
 * ```
 */

import { getDrizzle, eq, and, desc, sql, inArray } from './drizzle';
import * as schema from './schema';

// Re-export types
export type { Tag, Vote, Favorite, Comment, Card, CardVersion, User } from './schema';

/**
 * Get all tags ordered by category and usage
 */
export async function drizzleGetAllTags() {
  const db = await getDrizzle();
  return db.select()
    .from(schema.tags)
    .orderBy(schema.tags.category, desc(schema.tags.usageCount), schema.tags.name);
}

/**
 * Get blocked tags
 */
export async function drizzleGetBlockedTags() {
  const db = await getDrizzle();
  // Note: is_blocked column may not exist in schema.ts yet
  // Using raw sql for the condition
  const results = await db.select()
    .from(schema.tags)
    .where(sql`is_blocked = 1`);
  return results.map(r => ({ slug: r.slug }));
}

/**
 * Get a single tag by slug
 */
export async function drizzleGetTagBySlug(slug: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.tags)
    .where(eq(schema.tags.slug, slug))
    .limit(1);
  return result[0] || null;
}

/**
 * Get user's vote on a card
 */
export async function drizzleGetUserVote(userId: string, cardId: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.votes)
    .where(and(
      eq(schema.votes.userId, userId),
      eq(schema.votes.cardId, cardId)
    ))
    .limit(1);
  return result[0]?.vote ?? null;
}

/**
 * Check if user has favorited a card
 */
export async function drizzleIsFavorited(userId: string, cardId: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.favorites)
    .where(and(
      eq(schema.favorites.userId, userId),
      eq(schema.favorites.cardId, cardId)
    ))
    .limit(1);
  return result.length > 0;
}

/**
 * Get user's favorite card IDs
 */
export async function drizzleGetUserFavorites(userId: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.favorites)
    .where(eq(schema.favorites.userId, userId))
    .orderBy(desc(schema.favorites.createdAt));
  return result.map(r => r.cardId);
}

/**
 * Get card versions for a card
 */
export async function drizzleGetCardVersions(cardId: string) {
  const db = await getDrizzle();
  return db.select()
    .from(schema.cardVersions)
    .where(eq(schema.cardVersions.cardId, cardId))
    .orderBy(desc(schema.cardVersions.createdAt));
}

/**
 * Get a single card by ID (basic fields only)
 */
export async function drizzleGetCardById(cardId: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.cards)
    .where(eq(schema.cards.id, cardId))
    .limit(1);
  return result[0] || null;
}

/**
 * Get a single card by slug (basic fields only)
 */
export async function drizzleGetCardBySlug(slug: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.cards)
    .where(eq(schema.cards.slug, slug))
    .limit(1);
  return result[0] || null;
}

/**
 * Increment download count
 */
export async function drizzleIncrementDownloads(cardId: string) {
  const db = await getDrizzle();
  await db.update(schema.cards)
    .set({ downloadsCount: sql`downloads_count + 1` })
    .where(eq(schema.cards.id, cardId));
}

/**
 * Update card visibility
 */
export async function drizzleUpdateCardVisibility(
  cardId: string,
  visibility: 'public' | 'nsfw_only' | 'unlisted' | 'blocked'
) {
  const db = await getDrizzle();
  await db.update(schema.cards)
    .set({
      visibility,
      updatedAt: sql`unixepoch()`,
    })
    .where(eq(schema.cards.id, cardId));
}

/**
 * Update card moderation state
 */
export async function drizzleUpdateModerationState(
  cardId: string,
  state: 'ok' | 'review' | 'blocked'
) {
  const db = await getDrizzle();
  await db.update(schema.cards)
    .set({
      moderationState: state,
      updatedAt: sql`unixepoch()`,
    })
    .where(eq(schema.cards.id, cardId));
}

/**
 * Get user by ID
 */
export async function drizzleGetUserById(userId: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return result[0] || null;
}

/**
 * Get user by username
 */
export async function drizzleGetUserByUsername(username: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.users)
    .where(eq(schema.users.username, username))
    .limit(1);
  return result[0] || null;
}

/**
 * Get comments for a card (with user info via join)
 */
export async function drizzleGetComments(cardId: string) {
  const db = await getDrizzle();
  // Note: Using raw query with join due to Drizzle union type limitations
  const results = await db.select()
    .from(schema.comments)
    .where(eq(schema.comments.cardId, cardId))
    .orderBy(schema.comments.createdAt);

  // Fetch user info separately for each comment
  const userIds = [...new Set(results.map(r => r.userId).filter(Boolean))];
  const userMap = new Map<string, { username: string; displayName: string | null }>();

  if (userIds.length > 0) {
    const users = await db.select()
      .from(schema.users)
      .where(inArray(schema.users.id, userIds));
    for (const user of users) {
      userMap.set(user.id, { username: user.username, displayName: user.displayName });
    }
  }

  return results.map(r => ({
    id: r.id,
    userId: r.userId,
    parentId: r.parentId,
    content: r.content,
    createdAt: r.createdAt,
    username: r.userId ? userMap.get(r.userId)?.username : null,
    displayName: r.userId ? userMap.get(r.userId)?.displayName : null,
  }));
}

/**
 * Get tags for multiple cards (batch)
 */
export async function drizzleGetTagsForCards(cardIds: string[]) {
  if (cardIds.length === 0) return new Map<string, { id: number; name: string; slug: string; category: string | null }[]>();

  const db = await getDrizzle();
  // Fetch card-tag relationships
  const cardTagResults = await db.select()
    .from(schema.cardTags)
    .where(inArray(schema.cardTags.cardId, cardIds));

  // Get unique tag IDs
  const tagIds = [...new Set(cardTagResults.map(ct => ct.tagId))];
  if (tagIds.length === 0) return new Map();

  // Fetch tag details
  const tagResults = await db.select()
    .from(schema.tags)
    .where(inArray(schema.tags.id, tagIds));

  const tagById = new Map(tagResults.map(t => [t.id, t]));

  const tagMap = new Map<string, { id: number; name: string; slug: string; category: string | null }[]>();
  for (const ct of cardTagResults) {
    const tag = tagById.get(ct.tagId);
    if (!tag) continue;

    if (!tagMap.has(ct.cardId)) {
      tagMap.set(ct.cardId, []);
    }
    tagMap.get(ct.cardId)!.push({
      id: tag.id,
      name: tag.name,
      slug: tag.slug,
      category: tag.category,
    });
  }
  return tagMap;
}

/**
 * Check if any tags are blocked
 */
export async function drizzleCheckBlockedTags(tagSlugs: string[]) {
  if (tagSlugs.length === 0) return [];

  const db = await getDrizzle();
  const results = await db.select()
    .from(schema.tags)
    .where(and(
      inArray(schema.tags.slug, tagSlugs),
      sql`is_blocked = 1`
    ));

  return results.map(r => r.name);
}

/**
 * Get session by ID
 */
export async function drizzleGetSession(sessionId: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  return result[0] || null;
}

/**
 * Delete expired sessions
 */
export async function drizzleDeleteExpiredSessions() {
  const db = await getDrizzle();
  const now = Math.floor(Date.now() / 1000);
  await db.delete(schema.sessions)
    .where(sql`expires_at < ${now}`);
}

/**
 * Get tag preferences for a user
 */
export async function drizzleGetTagPreferences(userId: string) {
  const db = await getDrizzle();
  const prefs = await db.select()
    .from(schema.tagPreferences)
    .where(eq(schema.tagPreferences.userId, userId));

  if (prefs.length === 0) return [];

  // Fetch tag details
  const tagIds = prefs.map(p => p.tagId);
  const tags = await db.select()
    .from(schema.tags)
    .where(inArray(schema.tags.id, tagIds));

  const tagById = new Map(tags.map(t => [t.id, t]));

  return prefs.map(p => {
    const tag = tagById.get(p.tagId);
    return {
      tagId: p.tagId,
      preference: p.preference,
      tagName: tag?.name ?? '',
      tagSlug: tag?.slug ?? '',
    };
  });
}

/**
 * Get user follows
 */
export async function drizzleGetUserFollowing(userId: string) {
  const db = await getDrizzle();
  const follows = await db.select()
    .from(schema.userFollows)
    .where(eq(schema.userFollows.followerId, userId));

  if (follows.length === 0) return [];

  // Fetch user details
  const userIds = follows.map(f => f.followingId);
  const users = await db.select()
    .from(schema.users)
    .where(inArray(schema.users.id, userIds));

  const userById = new Map(users.map(u => [u.id, u]));

  return follows.map(f => {
    const user = userById.get(f.followingId);
    return {
      followingId: f.followingId,
      username: user?.username ?? '',
      displayName: user?.displayName ?? null,
    };
  });
}

/**
 * Check if user follows another user
 */
export async function drizzleIsFollowing(followerId: string, followingId: string) {
  const db = await getDrizzle();
  const result = await db.select()
    .from(schema.userFollows)
    .where(and(
      eq(schema.userFollows.followerId, followerId),
      eq(schema.userFollows.followingId, followingId)
    ))
    .limit(1);
  return result.length > 0;
}
