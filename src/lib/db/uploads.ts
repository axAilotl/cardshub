import { nanoid } from 'nanoid';
import { createHash, randomBytes } from 'crypto';
import { getDatabase } from './async-db';

export type UploadVisibility = 'public' | 'unlisted' | 'private';

export interface UploadRow {
  id: string;
  storage_url: string;
  path: string;
  uploader_id: string | null;
  visibility: UploadVisibility;
  access_token_hash: string | null;
  created_at: number;
}

export interface CreateUploadInput {
  storageUrl: string;
  path: string;
  uploaderId: string | null;
  visibility?: UploadVisibility;
  accessTokenHash?: string | null;
}

export async function createUpload(input: CreateUploadInput): Promise<{ id: string }> {
  const db = await getDatabase();
  const id = nanoid();

  await db.prepare(
    `
    INSERT INTO uploads (id, storage_url, path, uploader_id, visibility, access_token_hash)
    VALUES (?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    input.storageUrl,
    input.path,
    input.uploaderId,
    input.visibility || 'public',
    input.accessTokenHash || null
  );

  return { id };
}

export async function getUploadById(id: string): Promise<UploadRow | null> {
  const db = await getDatabase();
  const row = await db.prepare('SELECT * FROM uploads WHERE id = ?').get<UploadRow>(id);
  return row || null;
}

export async function getUploadByPath(path: string): Promise<UploadRow | null> {
  const db = await getDatabase();
  const row = await db.prepare('SELECT * FROM uploads WHERE path = ?').get<UploadRow>(path);
  return row || null;
}

export async function updateUploadVisibility(id: string, visibility: UploadVisibility, accessTokenHash: string | null): Promise<void> {
  const db = await getDatabase();
  await db.prepare(
    `
    UPDATE uploads
    SET visibility = ?, access_token_hash = ?
    WHERE id = ?
  `
  ).run(visibility, accessTokenHash, id);
}

export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  const hash = hashToken(token);
  return { token, hash };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function verifyToken(token: string, hash: string | null): boolean {
  if (!hash) return false;
  return hashToken(token) === hash;
}
