import fs from 'node:fs';
import path from 'node:path';

import { parseCard } from '@character-foundry/character-foundry/loader';
import { describe, expect, it } from 'vitest';

const DEFAULT_FIXTURES_DIR = '/home/vega/ai/character-foundry/fixtures';

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

    if (line.startsWith('### ') && !line.startsWith('### Tier 1: Basic')) {
      break;
    }

    const match = /^\| `(basic\/[^`]+)` \| ([^|]+) \| ([^|]+) \|/.exec(line);
    if (!match) continue;

    const relPath = match[1].trim();
    const expectedFormat = match[2].trim().toLowerCase() as Tier1Fixture['expectedFormat'];
    const rawSpec = match[3].trim().toLowerCase();

    // Loader normalizes unwrapped v1 JSON cards to v2.
    const expectedSpec = (rawSpec === 'v1' ? 'v2' : rawSpec) as Tier1Fixture['expectedSpec'];

    if (!['json', 'png', 'charx', 'voxta'].includes(expectedFormat)) continue;
    if (!['v2', 'v3'].includes(expectedSpec)) continue;

    entries.push({ relPath, expectedFormat, expectedSpec });
  }

  return entries;
}

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

const fixturesDir = getFixturesDir();
const fixturesExist = fs.existsSync(fixturesDir);

if (!fixturesExist) {
  if (allowMissingFixtures()) {
    describe.skip('Golden fixtures (Tier 1)', () => {});
  } else {
    describe('Golden fixtures (Tier 1)', () => {
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
  describe('Golden fixtures (Tier 1)', () => {
    const manifestPath = path.join(fixturesDir, 'MANIFEST.md');
    const manifest = fs.readFileSync(manifestPath, 'utf8');
    const tier1 = parseTier1FromManifest(manifest);

    it('loads Tier 1 entries from MANIFEST.md', () => {
      expect(tier1.length).toBeGreaterThan(0);
    });

    for (const fixture of tier1) {
      it(`parses ${fixture.relPath}`, () => {
        const absPath = path.join(fixturesDir, fixture.relPath);
        const bytes = toBytes(fs.readFileSync(absPath));

        const result = parseCard(bytes, { extractAssets: true });
        expect(result.containerFormat).toBe(fixture.expectedFormat);
        expect(result.spec).toBe(fixture.expectedSpec);
        expect(result.card).toBeDefined();
        expect(result.card.data).toBeDefined();
      });
    }

    it('extracts a main icon from baseline PNG', () => {
      const absPath = path.join(fixturesDir, 'basic/png/baseline_v3_small.png');
      const bytes = toBytes(fs.readFileSync(absPath));
      const result = parseCard(bytes, { extractAssets: true });

      const mainIcon = result.assets.find((a) => a.isMain && a.type === 'icon');
      expect(mainIcon).toBeTruthy();

      const data = mainIcon?.data;
      const byteLength = data
        ? data instanceof Uint8Array
          ? data.byteLength
          : new Uint8Array(data as ArrayBuffer).byteLength
        : 0;
      expect(byteLength).toBeGreaterThan(0);
    });
  });
}
