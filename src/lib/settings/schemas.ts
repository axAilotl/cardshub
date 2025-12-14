/**
 * Settings Panel Schemas
 *
 * Zod schemas that define the shape and validation for each settings panel.
 * These schemas serve as the single source of truth for:
 * - TypeScript types
 * - Form validation
 * - Default values
 * - Field labels (via .describe())
 */

import { z } from 'zod';

/**
 * Display Preferences Schema
 * Controls how content is displayed in the UI.
 * Stored in localStorage.
 */
export const DisplayPreferencesSchema = z.object({
  blurNsfwContent: z
    .boolean()
    .default(true)
    .describe('Blur NSFW Content'),
  showImagesInGreetings: z
    .boolean()
    .default(true)
    .describe('Show Images in Greetings'),
  cardSize: z
    .enum(['normal', 'large'])
    .default('large')
    .describe('Card Size'),
  sidebarExpanded: z
    .boolean()
    .default(false)
    .describe('Expand Sidebar by Default'),
});

export type DisplayPreferences = z.infer<typeof DisplayPreferencesSchema>;

export const displayPreferencesDefaults: DisplayPreferences = {
  blurNsfwContent: true,
  showImagesInGreetings: true,
  cardSize: 'large',
  sidebarExpanded: false,
};

/**
 * Profile Schema
 * User profile information stored via API.
 */
export const ProfileSchema = z.object({
  displayName: z
    .string()
    .max(50, 'Display name must be 50 characters or less')
    .optional()
    .nullable()
    .describe('Display Name'),
  email: z
    .string()
    .email('Invalid email address')
    .optional()
    .nullable()
    .or(z.literal(''))
    .describe('Email'),
  bio: z
    .string()
    .max(500, 'Bio must be 500 characters or less')
    .optional()
    .nullable()
    .describe('Bio'),
  profileCss: z
    .string()
    .max(10000, 'Custom CSS must be 10,000 characters or less')
    .optional()
    .nullable()
    .describe('Custom Profile CSS'),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const profileDefaults: Profile = {
  displayName: null,
  email: null,
  bio: null,
  profileCss: null,
};

/**
 * Tag Preferences Schema
 * Defines which tags to follow or block.
 * The actual tag selection uses a custom widget.
 */
export const TagPreferencesSchema = z.object({
  followedTagIds: z
    .array(z.string())
    .default([])
    .describe('Followed Tags'),
  blockedTagIds: z
    .array(z.string())
    .default([])
    .describe('Blocked Tags'),
});

export type TagPreferences = z.infer<typeof TagPreferencesSchema>;

export const tagPreferencesDefaults: TagPreferences = {
  followedTagIds: [],
  blockedTagIds: [],
};

/**
 * Combined User Settings (for localStorage context)
 * This is what the existing SettingsProvider uses.
 */
export const UserSettingsSchema = z.object({
  showImagesInGreetings: z.boolean().default(true),
  blurNsfwContent: z.boolean().default(true),
  sidebarExpanded: z.boolean().default(false),
  cardSize: z.enum(['normal', 'large']).default('large'),
  bannedTags: z.array(z.string()).default([]),
});

export type UserSettings = z.infer<typeof UserSettingsSchema>;
