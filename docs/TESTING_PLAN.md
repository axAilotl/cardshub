# Testing Plan - CardsHub Improvements

**Created:** December 9, 2025
**Test Framework:** Vitest
**Coverage Target:** 70%+

---

## Overview

This document defines the testing strategy and specific test cases for each phase of the CardsHub improvement plan. Tests are written **before** implementation (TDD approach for security-critical code).

---

## Test Directory Structure

```
tests/
├── setup.ts                    # Global test setup
├── mocks/
│   ├── d1.ts                   # D1 database mock
│   ├── kv.ts                   # KV namespace mock
│   ├── r2.ts                   # R2 bucket mock
│   ├── images.ts               # Images binding mock
│   └── fixtures/
│       ├── cards/              # Test card files (PNG, CharX, etc.)
│       ├── users.ts            # User fixtures
│       └── sessions.ts         # Session fixtures
├── lib/
│   ├── rate-limit/
│   ├── auth/
│   ├── db/
│   ├── storage/
│   ├── image/
│   └── services/
│       └── card-ingestion/
├── api/
│   ├── uploads/
│   ├── cards/
│   └── auth/
└── security/
    ├── r2-access.test.ts
    ├── path-traversal.test.ts
    ├── csrf.test.ts
    ├── rate-limit-bypass.test.ts
    └── input-validation.test.ts
```

---

## Phase 1: Security Tests

### 1.1 R2 Access Control Tests

**File:** `tests/security/r2-access.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/uploads/[...path]/route';
import { createMockRequest, createMockR2, createMockDB } from '../mocks';

describe('R2 Access Control', () => {
  let mockR2: ReturnType<typeof createMockR2>;
  let mockDB: ReturnType<typeof createMockDB>;

  beforeEach(() => {
    mockR2 = createMockR2();
    mockDB = createMockDB();
    vi.clearAllMocks();
  });

  describe('when metadata row is missing', () => {
    it('should return 403 Forbidden', async () => {
      // Arrange
      mockR2.get.mockResolvedValue({ arrayBuffer: () => Buffer.from('test') });
      mockDB.getUploadByPath.mockResolvedValue(null); // No metadata

      const request = createMockRequest('/api/uploads/cards/test.png');

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: ['cards', 'test.png'] }) });

      // Assert
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: 'Access denied' });
    });

    it('should not leak file existence via different error codes', async () => {
      // Arrange - file exists but no metadata
      mockR2.get.mockResolvedValue({ arrayBuffer: () => Buffer.from('test') });
      mockDB.getUploadByPath.mockResolvedValue(null);

      const request = createMockRequest('/api/uploads/cards/test.png');

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: ['cards', 'test.png'] }) });

      // Assert - should be 403 not 404 to prevent enumeration
      expect(response.status).toBe(403);
    });
  });

  describe('when file is private', () => {
    it('should return 403 for unauthenticated requests', async () => {
      // Arrange
      mockDB.getUploadByPath.mockResolvedValue({
        id: '1',
        path: 'cards/test.png',
        visibility: 'private',
        uploader_id: 'user-123',
        access_token_hash: null,
      });

      const request = createMockRequest('/api/uploads/cards/test.png');
      // No session

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: ['cards', 'test.png'] }) });

      // Assert
      expect(response.status).toBe(403);
    });

    it('should return 200 for owner', async () => {
      // Arrange
      mockDB.getUploadByPath.mockResolvedValue({
        id: '1',
        path: 'cards/test.png',
        visibility: 'private',
        uploader_id: 'user-123',
        access_token_hash: null,
      });
      mockR2.get.mockResolvedValue({
        arrayBuffer: () => Buffer.from('test'),
        httpMetadata: { contentType: 'image/png' },
      });

      const request = createMockRequest('/api/uploads/cards/test.png', {
        session: { user: { id: 'user-123', isAdmin: false } },
      });

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: ['cards', 'test.png'] }) });

      // Assert
      expect(response.status).toBe(200);
    });

    it('should return 200 for admin', async () => {
      // Arrange
      mockDB.getUploadByPath.mockResolvedValue({
        id: '1',
        path: 'cards/test.png',
        visibility: 'private',
        uploader_id: 'user-123',
        access_token_hash: null,
      });
      mockR2.get.mockResolvedValue({
        arrayBuffer: () => Buffer.from('test'),
        httpMetadata: { contentType: 'image/png' },
      });

      const request = createMockRequest('/api/uploads/cards/test.png', {
        session: { user: { id: 'admin-456', isAdmin: true } },
      });

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: ['cards', 'test.png'] }) });

      // Assert
      expect(response.status).toBe(200);
    });
  });

  describe('when file is unlisted with access token', () => {
    it('should return 403 without token', async () => {
      // Arrange
      mockDB.getUploadByPath.mockResolvedValue({
        id: '1',
        path: 'cards/test.png',
        visibility: 'unlisted',
        uploader_id: 'user-123',
        access_token_hash: 'abc123hash',
      });

      const request = createMockRequest('/api/uploads/cards/test.png');

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: ['cards', 'test.png'] }) });

      // Assert
      expect(response.status).toBe(403);
    });

    it('should return 200 with valid token', async () => {
      // Arrange
      const tokenHash = hashToken('valid-token');
      mockDB.getUploadByPath.mockResolvedValue({
        id: '1',
        path: 'cards/test.png',
        visibility: 'unlisted',
        uploader_id: 'user-123',
        access_token_hash: tokenHash,
      });
      mockR2.get.mockResolvedValue({
        arrayBuffer: () => Buffer.from('test'),
        httpMetadata: { contentType: 'image/png' },
      });

      const request = createMockRequest('/api/uploads/cards/test.png?token=valid-token');

      // Act
      const response = await GET(request, { params: Promise.resolve({ path: ['cards', 'test.png'] }) });

      // Assert
      expect(response.status).toBe(200);
    });
  });
});
```

---

### 1.2 Path Traversal Tests

**File:** `tests/security/path-traversal.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { safeResolveUploadPath, validateR2Key } from '@/app/api/uploads/utils';

describe('Path Traversal Prevention', () => {
  describe('safeResolveUploadPath (local filesystem)', () => {
    it('should reject path with ..', () => {
      expect(safeResolveUploadPath(['..', 'etc', 'passwd'])).toBeNull();
    });

    it('should reject path containing ..', () => {
      expect(safeResolveUploadPath(['cards', '..', 'secrets.txt'])).toBeNull();
    });

    it('should reject absolute paths', () => {
      expect(safeResolveUploadPath(['/etc/passwd'])).toBeNull();
    });

    it('should reject backslash paths', () => {
      expect(safeResolveUploadPath(['\\windows\\system32'])).toBeNull();
    });

    it('should reject encoded traversal', () => {
      expect(safeResolveUploadPath(['..%2f..%2fetc%2fpasswd'])).toBeNull();
    });

    it('should accept valid paths', () => {
      const result = safeResolveUploadPath(['cards', 'abc123.png']);
      expect(result).toMatch(/uploads[\/\\]cards[\/\\]abc123\.png$/);
    });
  });

  describe('validateR2Key (R2 bucket)', () => {
    it('should reject keys with ..', () => {
      expect(validateR2Key('../other-bucket/secret.png')).toBe(false);
    });

    it('should reject keys starting with /', () => {
      expect(validateR2Key('/absolute/path.png')).toBe(false);
    });

    it('should reject keys with null bytes', () => {
      expect(validateR2Key('cards/test\x00.png')).toBe(false);
    });

    it('should accept valid keys', () => {
      expect(validateR2Key('cards/abc123.png')).toBe(true);
      expect(validateR2Key('assets/user-456/image.webp')).toBe(true);
    });
  });
});
```

---

### 1.3 Rate Limiting Tests

**File:** `tests/lib/rate-limit/kv-limiter.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { KVRateLimiter } from '@/lib/rate-limit/kv';
import { createMockKV } from '../../mocks/kv';

describe('KVRateLimiter', () => {
  let limiter: KVRateLimiter;
  let mockKV: ReturnType<typeof createMockKV>;

  beforeEach(() => {
    mockKV = createMockKV();
    limiter = new KVRateLimiter(mockKV);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('check()', () => {
    it('should allow requests under limit', async () => {
      // Arrange
      mockKV.get.mockResolvedValue(null); // No existing bucket

      // Act
      const result = await limiter.check('user-123', 10, 60000);

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
      expect(mockKV.put).toHaveBeenCalled();
    });

    it('should block requests over limit', async () => {
      // Arrange
      const bucket = {
        count: 10,
        resetAt: Date.now() + 30000,
      };
      mockKV.get.mockResolvedValue(JSON.stringify(bucket));

      // Act
      const result = await limiter.check('user-123', 10, 60000);

      // Assert
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should reset after window expires', async () => {
      // Arrange
      const bucket = {
        count: 10,
        resetAt: Date.now() - 1000, // Expired
      };
      mockKV.get.mockResolvedValue(JSON.stringify(bucket));

      // Act
      const result = await limiter.check('user-123', 10, 60000);

      // Assert
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(9);
    });

    it('should handle KV failures gracefully', async () => {
      // Arrange
      mockKV.get.mockRejectedValue(new Error('KV unavailable'));

      // Act
      const result = await limiter.check('user-123', 10, 60000);

      // Assert - fail open or fail closed based on policy
      expect(result).toBeDefined();
      // Default: fail open (allow request but log error)
      expect(result.allowed).toBe(true);
    });

    it('should use atomic increments', async () => {
      // Arrange
      const bucket = { count: 5, resetAt: Date.now() + 30000 };
      mockKV.get.mockResolvedValue(JSON.stringify(bucket));

      // Act
      await limiter.check('user-123', 10, 60000);

      // Assert
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"count":6'),
        expect.any(Object)
      );
    });
  });

  describe('distributed behavior', () => {
    it('should share state across isolates via KV', async () => {
      // Simulate two isolates hitting same key
      const bucket = { count: 8, resetAt: Date.now() + 30000 };
      mockKV.get.mockResolvedValue(JSON.stringify(bucket));

      // Both should see count: 8, increment to 9
      const result1 = await limiter.check('user-123', 10, 60000);

      // Update mock to reflect increment
      const updatedBucket = { count: 9, resetAt: Date.now() + 30000 };
      mockKV.get.mockResolvedValue(JSON.stringify(updatedBucket));

      const result2 = await limiter.check('user-123', 10, 60000);

      expect(result1.remaining).toBe(1);
      expect(result2.remaining).toBe(0);
    });
  });
});
```

---

### 1.4 CSRF Tests

**File:** `tests/lib/auth/csrf.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { generateCsrfToken, validateCsrfToken, withCsrf } from '@/lib/auth/csrf';
import { createMockRequest } from '../../mocks';

describe('CSRF Protection', () => {
  describe('generateCsrfToken', () => {
    it('should generate unique tokens', () => {
      const token1 = generateCsrfToken();
      const token2 = generateCsrfToken();

      expect(token1).not.toBe(token2);
      expect(token1.length).toBeGreaterThan(20);
    });

    it('should generate cryptographically random tokens', () => {
      // Generate many tokens and check for patterns
      const tokens = Array.from({ length: 100 }, () => generateCsrfToken());
      const uniqueTokens = new Set(tokens);

      expect(uniqueTokens.size).toBe(100);
    });
  });

  describe('validateCsrfToken', () => {
    it('should reject requests without token', async () => {
      const request = createMockRequest('/api/cards', {
        method: 'POST',
        body: { name: 'test' },
        session: { csrfToken: 'valid-token' },
      });

      const result = await validateCsrfToken(request);
      expect(result).toBe(false);
    });

    it('should reject requests with invalid token', async () => {
      const request = createMockRequest('/api/cards', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'wrong-token' },
        session: { csrfToken: 'valid-token' },
      });

      const result = await validateCsrfToken(request);
      expect(result).toBe(false);
    });

    it('should accept requests with valid token in header', async () => {
      const request = createMockRequest('/api/cards', {
        method: 'POST',
        headers: { 'X-CSRF-Token': 'valid-token' },
        session: { csrfToken: 'valid-token' },
      });

      const result = await validateCsrfToken(request);
      expect(result).toBe(true);
    });

    it('should accept requests with valid token in body', async () => {
      const request = createMockRequest('/api/cards', {
        method: 'POST',
        body: { _csrf: 'valid-token', name: 'test' },
        session: { csrfToken: 'valid-token' },
      });

      const result = await validateCsrfToken(request);
      expect(result).toBe(true);
    });
  });

  describe('withCsrf middleware', () => {
    it('should pass through GET requests', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const wrappedHandler = withCsrf(handler);

      const request = createMockRequest('/api/cards', { method: 'GET' });
      await wrappedHandler(request);

      expect(handler).toHaveBeenCalled();
    });

    it('should block POST without token', async () => {
      const handler = vi.fn().mockResolvedValue(new Response('OK'));
      const wrappedHandler = withCsrf(handler);

      const request = createMockRequest('/api/cards', {
        method: 'POST',
        session: { csrfToken: 'valid-token' },
      });
      const response = await wrappedHandler(request);

      expect(handler).not.toHaveBeenCalled();
      expect(response.status).toBe(403);
    });
  });
});
```

---

### 1.5 Client Metadata Validation Tests

**File:** `tests/lib/card-parser/server-validation.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { validateAndRecomputeMetadata } from '@/lib/card-parser/server-validation';
import { parseCard } from '@character-foundry/loader';
import { readTestFixture } from '../../helpers';

describe('Server Metadata Validation', () => {
  describe('token recomputation', () => {
    it('should recompute token counts even if client provides them', async () => {
      // Arrange
      const cardBuffer = await readTestFixture('cards/test-card.png');
      const parseResult = await parseCard(cardBuffer);

      const clientMetadata = {
        tokens: {
          description: 999, // Fake value
          personality: 999,
          total: 9999,
        },
      };

      // Act
      const result = validateAndRecomputeMetadata(clientMetadata, parseResult, cardBuffer);

      // Assert
      expect(result.authoritative.tokens.description).not.toBe(999);
      expect(result.authoritative.tokens.total).not.toBe(9999);
      expect(result.discrepancies).toContainEqual(
        expect.objectContaining({ field: 'tokens.description' })
      );
    });

    it('should mark as trusted when counts match', async () => {
      // Arrange
      const cardBuffer = await readTestFixture('cards/test-card.png');
      const parseResult = await parseCard(cardBuffer);

      // Client provides accurate counts
      const actualTokens = countCardTokens(parseResult.card);
      const clientMetadata = { tokens: actualTokens };

      // Act
      const result = validateAndRecomputeMetadata(clientMetadata, parseResult, cardBuffer);

      // Assert
      expect(result.isTrusted).toBe(true);
      expect(result.discrepancies).toHaveLength(0);
    });
  });

  describe('content hash validation', () => {
    it('should recompute content hash', async () => {
      // Arrange
      const cardBuffer = await readTestFixture('cards/test-card.png');
      const parseResult = await parseCard(cardBuffer);

      const clientMetadata = {
        contentHash: 'fake-hash-12345',
      };

      // Act
      const result = validateAndRecomputeMetadata(clientMetadata, parseResult, cardBuffer);

      // Assert
      expect(result.authoritative.contentHash).not.toBe('fake-hash-12345');
      expect(result.authoritative.contentHash).toHaveLength(64); // SHA-256 hex
    });
  });

  describe('tag validation', () => {
    it('should filter blocked tags', async () => {
      // Arrange
      const cardBuffer = await readTestFixture('cards/test-card.png');
      const parseResult = await parseCard(cardBuffer);

      const clientMetadata = {
        tags: ['valid-tag', 'blocked-tag', 'another-valid'],
      };

      // Act
      const result = validateAndRecomputeMetadata(clientMetadata, parseResult, cardBuffer, {
        validateTags: (tags) => ({
          valid: !tags.includes('blocked-tag'),
          filtered: tags.filter(t => t !== 'blocked-tag'),
          reason: 'blocked-tag is not allowed',
        }),
      });

      // Assert
      expect(result.warnings).toContain('blocked-tag is not allowed');
    });
  });

  describe('without client metadata', () => {
    it('should work with server-only parsing', async () => {
      // Arrange
      const cardBuffer = await readTestFixture('cards/test-card.png');
      const parseResult = await parseCard(cardBuffer);

      // Act
      const result = validateAndRecomputeMetadata(null, parseResult, cardBuffer);

      // Assert
      expect(result.isValid).toBe(true);
      expect(result.authoritative.tokens).toBeDefined();
      expect(result.authoritative.contentHash).toBeDefined();
    });
  });
});
```

---

## Phase 2: Architecture Tests

### 2.1 CardIngestionService Tests

**File:** `tests/lib/services/card-ingestion/pipeline.test.ts`

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CardIngestionPipeline } from '@/lib/services/card-ingestion/pipeline';
import { readTestFixture } from '../../../helpers';

describe('CardIngestionPipeline', () => {
  let pipeline: CardIngestionPipeline;

  beforeEach(() => {
    pipeline = new CardIngestionPipeline({
      imageService: mockImageService,
      storageService: mockStorageService,
      databaseService: mockDatabaseService,
    });
  });

  describe('ingest()', () => {
    it('should process PNG card successfully', async () => {
      // Arrange
      const pngBuffer = await readTestFixture('cards/valid-ccv3.png');

      // Act
      const result = await pipeline.ingest(pngBuffer, {
        uploaderId: 'user-123',
        visibility: 'public',
      });

      // Assert
      expect(result.success).toBe(true);
      expect(result.card).toBeDefined();
      expect(result.card.specVersion).toBe('v3');
    });

    it('should process CharX package successfully', async () => {
      const charxBuffer = await readTestFixture('cards/valid.charx');
      const result = await pipeline.ingest(charxBuffer, { uploaderId: 'user-123' });

      expect(result.success).toBe(true);
      expect(result.sourceFormat).toBe('charx');
    });

    it('should process Voxta package successfully', async () => {
      const voxtaBuffer = await readTestFixture('cards/valid.voxpkg');
      const result = await pipeline.ingest(voxtaBuffer, { uploaderId: 'user-123' });

      expect(result.success).toBe(true);
      expect(result.sourceFormat).toBe('voxta');
    });

    it('should reject invalid files', async () => {
      const invalidBuffer = Buffer.from('not a card');
      const result = await pipeline.ingest(invalidBuffer, { uploaderId: 'user-123' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('format');
    });

    it('should reject oversized files', async () => {
      const oversizedBuffer = Buffer.alloc(60 * 1024 * 1024); // 60MB
      const result = await pipeline.ingest(oversizedBuffer, { uploaderId: 'user-123' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('size');
    });
  });

  describe('stage isolation', () => {
    it('should not save to storage if validation fails', async () => {
      // Arrange - card with invalid data
      const invalidCard = await readTestFixture('cards/invalid-schema.png');

      // Act
      await pipeline.ingest(invalidCard, { uploaderId: 'user-123' });

      // Assert
      expect(mockStorageService.store).not.toHaveBeenCalled();
    });

    it('should not save to database if storage fails', async () => {
      // Arrange
      const validCard = await readTestFixture('cards/valid-ccv3.png');
      mockStorageService.store.mockRejectedValue(new Error('Storage failed'));

      // Act
      const result = await pipeline.ingest(validCard, { uploaderId: 'user-123' });

      // Assert
      expect(result.success).toBe(false);
      expect(mockDatabaseService.insertCard).not.toHaveBeenCalled();
    });
  });
});
```

---

### 2.2 Image Service Tests

**File:** `tests/lib/image/node-service.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { SharpImageService } from '@/lib/image/node-service';
import { readTestFixture } from '../../helpers';

describe('SharpImageService', () => {
  let service: SharpImageService;

  beforeEach(() => {
    service = new SharpImageService();
  });

  describe('resize()', () => {
    it('should resize image maintaining aspect ratio', async () => {
      const input = await readTestFixture('images/400x600.png');
      const output = await service.resize(input, {
        width: 200,
        height: 300,
        fit: 'contain',
      });

      const info = await service.getInfo(output);
      expect(info.width).toBeLessThanOrEqual(200);
      expect(info.height).toBeLessThanOrEqual(300);
    });

    it('should crop to exact dimensions with cover fit', async () => {
      const input = await readTestFixture('images/400x600.png');
      const output = await service.resize(input, {
        width: 200,
        height: 200,
        fit: 'cover',
      });

      const info = await service.getInfo(output);
      expect(info.width).toBe(200);
      expect(info.height).toBe(200);
    });
  });

  describe('convert()', () => {
    it('should convert PNG to WebP', async () => {
      const input = await readTestFixture('images/test.png');
      const output = await service.convert(input, {
        format: 'webp',
        quality: 80,
      });

      const info = await service.getInfo(output);
      expect(info.format).toBe('webp');
    });

    it('should preserve transparency in WebP', async () => {
      const input = await readTestFixture('images/transparent.png');
      const output = await service.convert(input, {
        format: 'webp',
        quality: 90,
      });

      // WebP supports alpha
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe('thumbnail()', () => {
    it('should generate card thumbnail', async () => {
      const input = await readTestFixture('images/400x600.png');
      const output = await service.thumbnail(input, 'card');

      const info = await service.getInfo(output);
      expect(info.width).toBe(500);
      expect(info.height).toBe(750);
      expect(info.format).toBe('webp');
    });

    it('should generate grid thumbnail', async () => {
      const input = await readTestFixture('images/400x600.png');
      const output = await service.thumbnail(input, 'grid');

      const info = await service.getInfo(output);
      expect(info.width).toBe(300);
      expect(info.height).toBe(450);
    });
  });
});
```

---

## Test Fixtures

### Required Test Files

```
tests/mocks/fixtures/
├── cards/
│   ├── valid-ccv2.png          # Valid CCv2 card in PNG
│   ├── valid-ccv3.png          # Valid CCv3 card in PNG
│   ├── valid.charx             # Valid CharX package
│   ├── valid.voxpkg            # Valid Voxta package
│   ├── valid.json              # Valid JSON card
│   ├── invalid-schema.png      # PNG with malformed JSON
│   ├── no-chara-chunk.png      # PNG without character data
│   ├── oversized.png           # 60MB file
│   └── multi-char.voxpkg       # Multi-character Voxta
├── images/
│   ├── 400x600.png             # Standard portrait
│   ├── 1920x1080.png           # Landscape
│   ├── transparent.png         # With alpha channel
│   └── corrupted.png           # Invalid PNG
└── users.ts                    # User fixture factory
```

---

## CI Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Run tests
        run: npm run test:run -- --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        with:
          files: ./coverage/lcov.info

  security-tests:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Run security tests
        run: npm run test:run -- tests/security/
```

---

## Coverage Requirements

| Category | Minimum | Target |
|----------|---------|--------|
| Overall | 60% | 70%+ |
| Security (tests/security/*) | 90% | 95% |
| Services (src/lib/services/*) | 80% | 85% |
| API Routes | 70% | 80% |
| Components | 50% | 60% |

---

## Running Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Specific file/directory
npm test -- tests/security/

# Watch mode
npm test -- --watch

# Update snapshots
npm test -- -u
```
