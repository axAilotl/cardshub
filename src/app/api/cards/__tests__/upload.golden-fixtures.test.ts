import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { parseFromBufferWithAssets } from '@/lib/client/card-parser';

const DEFAULT_FIXTURES_DIR = '/home/vega/ai/character-foundry/fixtures';

function getFixturesDir(): string {
  return process.env.CF_FIXTURES_DIR?.trim() || DEFAULT_FIXTURES_DIR;
}

function allowMissingFixtures(): boolean {
  const raw = (process.env.CF_ALLOW_MISSING_FIXTURES || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function toBytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex');
}

function publicUrlForStorageUrl(url: string): string {
  const pathPart = url.replace(/^file:\/\/\//, '').replace(/^r2:\/\//, '');
  return `/api/uploads/${pathPart}`;
}

// Mocks MUST be declared before importing the route handler.
vi.mock('@/lib/auth', () => ({
  getSession: vi.fn(async () => ({ user: { id: 'user_test', isAdmin: false } })),
}));

vi.mock('@/lib/db/settings', () => ({
  isUploadsEnabled: vi.fn(async () => true),
}));

vi.mock('@/lib/utils', () => ({
  generateId: vi.fn(() => 'card_test_id'),
  generateSlug: vi.fn(() => 'test-slug'),
}));

vi.mock('@/lib/db', () => ({
  isCloudflareRuntime: vi.fn(() => false),
}));

vi.mock('@/lib/storage', () => ({
  store: vi.fn(async (_data: Buffer, objectPath: string) => `file:///${objectPath}`),
  getPublicUrl: vi.fn((url: string) => publicUrlForStorageUrl(url)),
}));

vi.mock('@/lib/image', () => ({
  saveAssets: vi.fn(async () => ({ assets: [] })),
}));

vi.mock('@/lib/image/process', () => ({
  processThumbnail: vi.fn(async (_bytes: Uint8Array, cardId: string) => `thumbnails/${cardId}.webp`),
  processCardImages: vi.fn(async (data: Record<string, unknown>) => ({ displayData: data })),
}));

vi.mock('@/lib/cache/kv-cache', () => ({
  cacheDeleteByPrefix: vi.fn(async () => {}),
  CACHE_PREFIX: { CARDS: 'cards:' },
}));

vi.mock('@/lib/db/collections', () => ({
  createCollection: vi.fn(async () => {}),
  getCollectionByPackageId: vi.fn(async () => null),
  generateCollectionSlug: vi.fn(async () => 'collection-slug'),
}));

vi.mock('@/lib/db/cards', () => ({
  getCards: vi.fn(async () => []),
  checkBlockedTags: vi.fn(async () => []),
  computeContentHash: (data: Buffer | string) => createHash('sha256').update(data).digest('hex'),
  createCard: vi.fn(async (input: { id: string }) => ({ cardId: input.id, versionId: 'version_test' })),
}));

import { POST } from '@/app/api/cards/route';
import { createCard } from '@/lib/db/cards';

const fixturesDir = getFixturesDir();
const fixturesExist = fs.existsSync(fixturesDir);

const BASIC_UPLOAD_FIXTURES = [
  'basic/png/baseline_v3_small.png',
  'basic/charx/baseline_v3_small.charx',
  'basic/json/hybrid_format_v2.json',
  'basic/voxta/character_only_small.voxpkg',
] as const;

if (!fixturesExist) {
  if (allowMissingFixtures()) {
    describe.skip('POST /api/cards (golden fixtures)', () => {});
  } else {
    describe('POST /api/cards (golden fixtures)', () => {
      it('requires CF_FIXTURES_DIR', () => {
        throw new Error(
          `[fixtures] Missing fixtures directory: ${fixturesDir}\n` +
            `Set CF_FIXTURES_DIR to the golden fixtures root (example: ${DEFAULT_FIXTURES_DIR})\n` +
            `or set CF_ALLOW_MISSING_FIXTURES=1 to skip this suite.`,
        );
      });
    });
  }
} else {
  describe('POST /api/cards (golden fixtures)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    for (const relPath of BASIC_UPLOAD_FIXTURES) {
      it(`ignores client metadata and persists server-parsed values (${relPath})`, async () => {
        const absPath = path.join(fixturesDir, relPath);
        const filename = path.basename(absPath);
        const bytes = toBytes(fs.readFileSync(absPath));

        // Client preview (what UX expects to see)
        const clientParsed = parseFromBufferWithAssets(bytes, filename).card;

        // Poisoned metadata simulates a broken client or tampering.
        const poisonedMetadata = {
          name: 'HACKED_NAME',
          description: 'HACKED_DESCRIPTION',
          creator: 'HACKED_CREATOR',
          creatorNotes: 'HACKED_NOTES',
          specVersion: 'v2',
          sourceFormat: 'json',
          tokens: {
            description: 999999,
            personality: 999999,
            scenario: 999999,
            mesExample: 999999,
            firstMes: 999999,
            systemPrompt: 999999,
            postHistory: 999999,
            total: 999999,
          },
          metadata: {
            hasAlternateGreetings: false,
            alternateGreetingsCount: 0,
            hasLorebook: false,
            lorebookEntriesCount: 0,
            hasEmbeddedImages: false,
            embeddedImagesCount: 0,
          },
          tags: ['hacked'],
          contentHash: 'deadbeef',
          visibility: 'public',
          cardData: '{}',
        };

        const formData = new FormData();
        formData.append('file', new Blob([Buffer.from(bytes)]), filename);
        formData.append('metadata', JSON.stringify(poisonedMetadata));
        formData.append('tags', JSON.stringify(['user-tag']));
        formData.append('visibility', 'public');

        const request = new Request('http://localhost/api/cards', {
          method: 'POST',
          body: formData,
        });

        const response = await POST(request as never);
        expect(response.status).toBe(200);

        const payload = await response.json();
        expect(payload?.success).toBe(true);
        expect(payload?.data?.slug).toBe('test-slug');

        const mockedCreateCard = createCard as unknown as ReturnType<typeof vi.fn>;
        expect(mockedCreateCard).toHaveBeenCalledTimes(1);

        const createInput = mockedCreateCard.mock.calls[0][0] as {
          id: string;
          slug: string;
          name: string;
          version: {
            contentHash: string;
            specVersion: string;
            sourceFormat: string;
            tokens: Record<string, number>;
            cardData: string;
          };
        };

        expect(createInput.id).toBe('card_test_id');
        expect(createInput.slug).toBe('test-slug');

        // Server must not trust client metadata fields.
        expect(createInput.name).not.toBe(poisonedMetadata.name);
        expect(createInput.version.contentHash).not.toBe(poisonedMetadata.contentHash);
        expect(createInput.version.tokens.total).not.toBe(poisonedMetadata.tokens.total);

        // Equivalence: server persisted values match the parsed card preview.
        expect(createInput.name).toBe(clientParsed.name);
        expect(createInput.version.specVersion).toBe(clientParsed.specVersion);
        expect(createInput.version.sourceFormat).toBe(clientParsed.sourceFormat);
        expect(createInput.version.tokens).toEqual(clientParsed.tokens);
        expect(createInput.version.contentHash).toBe(sha256Hex(bytes));

        const storedCardData = JSON.parse(createInput.version.cardData) as unknown;
        expect(storedCardData).toEqual(clientParsed.raw);
      });
    }
  });
}
