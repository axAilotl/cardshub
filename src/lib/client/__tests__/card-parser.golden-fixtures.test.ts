import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseFromBufferWithAssets } from '@/lib/client/card-parser';

type Tier1Fixture = {
  relPath: string;
  expectedFormat: 'json' | 'png' | 'charx' | 'voxta';
  expectedSpec: 'v2' | 'v3';
};

function parseTier1FromManifest(manifest: string): Tier1Fixture[] {
  const lines = manifest.split(/\r?\n/);
  let inTier1Table = false;

  const entries: Tier1Fixture[] = [];
  for (const line of lines) {
    if (line.startsWith('### Tier 1: Basic')) {
      inTier1Table = true;
      continue;
    }

    if (!inTier1Table) continue;
    if (line.startsWith('### ') && !line.startsWith('### Tier 1: Basic')) break;

    const match = /^\| `(basic\/[^`]+)` \| ([^|]+) \| ([^|]+) \|/.exec(line);
    if (!match) continue;

    const relPath = match[1].trim();
    const expectedFormat = match[2].trim().toLowerCase() as Tier1Fixture['expectedFormat'];
    const rawSpec = match[3].trim().toLowerCase();
    const expectedSpec = (rawSpec === 'v1' ? 'v2' : rawSpec) as Tier1Fixture['expectedSpec'];

    if (!['json', 'png', 'charx', 'voxta'].includes(expectedFormat)) continue;
    if (!['v2', 'v3'].includes(expectedSpec)) continue;

    entries.push({ relPath, expectedFormat, expectedSpec });
  }

  return entries;
}

function getFixturesDir(): string | null {
  return process.env.CF_FIXTURES_DIR?.trim() || null;
}

function allowMissingFixtures(): boolean {
  const raw = (process.env.CF_ALLOW_MISSING_FIXTURES || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes';
}

function toBytes(buffer: Buffer): Uint8Array {
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

const fixturesDir = getFixturesDir();
const fixturesExist = fixturesDir !== null && fs.existsSync(fixturesDir);

if (!fixturesExist) {
  if (allowMissingFixtures()) {
    describe.skip('Client card-parser (Tier 1 golden fixtures)', () => {});
  } else {
    describe('Client card-parser (Tier 1 golden fixtures)', () => {
      it('requires CF_FIXTURES_DIR', () => {
        throw new Error(
          `[fixtures] Missing fixtures directory\n` +
            `Set CF_FIXTURES_DIR to the golden fixtures root\n` +
            `or set CF_ALLOW_MISSING_FIXTURES=1 to skip this suite.`,
        );
      });
    });
  }
} else {
  describe('Client card-parser (Tier 1 golden fixtures)', () => {
    const manifest = fs.readFileSync(path.join(fixturesDir, 'MANIFEST.md'), 'utf8');
    const tier1 = parseTier1FromManifest(manifest);

    it('loads Tier 1 entries from MANIFEST.md', () => {
      expect(tier1.length).toBeGreaterThan(0);
    });

    for (const fixture of tier1) {
      it(`parses ${fixture.relPath}`, () => {
        const absPath = path.join(fixturesDir, fixture.relPath);
        const bytes = toBytes(fs.readFileSync(absPath));

        const result = parseFromBufferWithAssets(bytes, path.basename(absPath));
        expect(result.card.sourceFormat).toBe(fixture.expectedFormat);
        expect(result.card.specVersion).toBe(fixture.expectedSpec);

        // Token invariants
        expect(result.card.tokens.total).toBe(
          result.card.tokens.description +
            result.card.tokens.personality +
            result.card.tokens.scenario +
            result.card.tokens.mesExample +
            result.card.tokens.firstMes +
            result.card.tokens.systemPrompt +
            result.card.tokens.postHistory,
        );

        // Metadata invariants
        expect(result.card.metadata.alternateGreetingsCount).toBe(result.card.alternateGreetings.length);
        expect(result.card.metadata.hasAlternateGreetings).toBe(result.card.alternateGreetings.length > 0);
        const lorebookEntries = result.card.lorebook?.entries?.length ?? 0;
        expect(result.card.metadata.lorebookEntriesCount).toBe(lorebookEntries);
        expect(result.card.metadata.hasLorebook).toBe(lorebookEntries > 0);
        expect(result.card.metadata.hasEmbeddedImages).toBe(result.card.metadata.embeddedImagesCount > 0);

        // Main image expectations (Tier 1 baselines include an icon for non-JSON formats)
        if (fixture.expectedFormat === 'json') {
          expect(result.mainImage).toBeUndefined();
        } else {
          expect(result.mainImage).toBeDefined();
          expect(result.mainImage?.byteLength || 0).toBeGreaterThan(0);
        }
      });
    }
  });
}

