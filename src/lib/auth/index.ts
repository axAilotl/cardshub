import { getDb, UserRow } from '@/lib/db';
import { nanoid } from 'nanoid';
import { cookies } from 'next/headers';
import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'cardshub_session';
const SESSION_EXPIRY_DAYS = 30;

// Simple password hashing (in production, use bcrypt)
function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password: string, hash: string): boolean {
  return hashPassword(password) === hash;
}

export interface User {
  id: string;
  username: string;
  displayName: string | null;
  isAdmin: boolean;
}

export interface Session {
  id: string;
  userId: string;
  expiresAt: number;
}

// Create admin user if it doesn't exist
export function ensureAdminUser(): void {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');

  if (!existing) {
    const id = nanoid();
    const passwordHash = hashPassword('password');
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, is_admin, provider)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, 'admin', 'Administrator', passwordHash, 1, 'local');
  }
}

// Login with username and password
export function login(username: string, password: string): { user: User; sessionId: string } | null {
  const db = getDb();

  const user = db.prepare(`
    SELECT id, username, display_name, password_hash, is_admin
    FROM users WHERE username = ?
  `).get(username) as UserRow | undefined;

  if (!user || !user.password_hash) {
    return null;
  }

  if (!verifyPassword(password, user.password_hash)) {
    return null;
  }

  // Create session
  const sessionId = nanoid(32);
  const expiresAt = Math.floor(Date.now() / 1000) + (SESSION_EXPIRY_DAYS * 24 * 60 * 60);

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionId, user.id, expiresAt);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      isAdmin: user.is_admin === 1,
    },
    sessionId,
  };
}

// Logout - delete session
export function logout(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

// Get session from cookie
export async function getSession(): Promise<{ user: User; session: Session } | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId) {
    return null;
  }

  return getSessionById(sessionId);
}

// Get session by ID
export function getSessionById(sessionId: string): { user: User; session: Session } | null {
  const db = getDb();

  const result = db.prepare(`
    SELECT
      s.id as session_id,
      s.user_id,
      s.expires_at,
      u.username,
      u.display_name,
      u.is_admin
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.id = ?
  `).get(sessionId) as {
    session_id: string;
    user_id: string;
    expires_at: number;
    username: string;
    display_name: string | null;
    is_admin: number;
  } | undefined;

  if (!result) {
    return null;
  }

  // Check if session expired
  const now = Math.floor(Date.now() / 1000);
  if (result.expires_at < now) {
    // Delete expired session
    db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
    return null;
  }

  return {
    user: {
      id: result.user_id,
      username: result.username,
      displayName: result.display_name,
      isAdmin: result.is_admin === 1,
    },
    session: {
      id: result.session_id,
      userId: result.user_id,
      expiresAt: result.expires_at,
    },
  };
}

// Register a new user
export function register(username: string, password: string): { user: User; sessionId: string } | { error: string } {
  const db = getDb();

  // Check if username exists
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return { error: 'Username already taken' };
  }

  // Create user
  const id = nanoid();
  const passwordHash = hashPassword(password);

  db.prepare(`
    INSERT INTO users (id, username, password_hash, is_admin, provider)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, username, passwordHash, 0, 'local');

  // Create session
  const sessionId = nanoid(32);
  const expiresAt = Math.floor(Date.now() / 1000) + (SESSION_EXPIRY_DAYS * 24 * 60 * 60);

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionId, id, expiresAt);

  return {
    user: {
      id,
      username,
      displayName: null,
      isAdmin: false,
    },
    sessionId,
  };
}

// OAuth login/register - find or create user by provider
export function loginWithOAuth(provider: string, providerId: string, profile: {
  email?: string | null;
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): { user: User; sessionId: string } {
  const db = getDb();

  // Check if user exists with this provider
  let user = db.prepare(`
    SELECT id, username, display_name, is_admin
    FROM users WHERE provider = ? AND provider_id = ?
  `).get(provider, providerId) as UserRow | undefined;

  if (!user) {
    // Check if username is taken
    let username = profile.username;
    const existingUsername = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existingUsername) {
      // Append random suffix to username
      username = `${username}_${nanoid(4)}`;
    }

    // Create new user
    const id = nanoid();
    db.prepare(`
      INSERT INTO users (id, email, username, display_name, avatar_url, is_admin, provider, provider_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      profile.email || null,
      username,
      profile.displayName || username,
      profile.avatarUrl || null,
      0,
      provider,
      providerId
    );

    user = { id, username, display_name: profile.displayName || username, is_admin: 0 } as UserRow;
  }

  // Create session
  const sessionId = nanoid(32);
  const expiresAt = Math.floor(Date.now() / 1000) + (SESSION_EXPIRY_DAYS * 24 * 60 * 60);

  db.prepare(`
    INSERT INTO sessions (id, user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionId, user.id, expiresAt);

  return {
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      isAdmin: user.is_admin === 1,
    },
    sessionId,
  };
}

// Update user password (for admin break-glass)
export function updatePassword(userId: string, newPassword: string): boolean {
  const db = getDb();
  const passwordHash = hashPassword(newPassword);

  const result = db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = unixepoch()
    WHERE id = ?
  `).run(passwordHash, userId);

  return result.changes > 0;
}

// Update password by username (for admin break-glass via CLI or route)
export function updatePasswordByUsername(username: string, newPassword: string): boolean {
  const db = getDb();
  const passwordHash = hashPassword(newPassword);

  const result = db.prepare(`
    UPDATE users SET password_hash = ?, updated_at = unixepoch()
    WHERE username = ?
  `).run(passwordHash, username);

  return result.changes > 0;
}

export { SESSION_COOKIE_NAME, SESSION_EXPIRY_DAYS };
