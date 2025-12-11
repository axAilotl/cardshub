import { describe, it, expect } from 'vitest';
import { safeResolveUploadPath } from '../utils';
import { join } from 'path';

describe('safeResolveUploadPath', () => {
  it('allows normal paths inside uploads', () => {
    const path = safeResolveUploadPath(['thumbnails', 'abc.webp']);
    expect(path).toBe(join(process.cwd(), 'uploads', 'thumbnails', 'abc.webp'));
  });

  it('rejects traversal outside uploads', () => {
    const path = safeResolveUploadPath(['..', 'package.json']);
    expect(path).toBeNull();
  });

  it('rejects absolute-like segments', () => {
    const path = safeResolveUploadPath(['//', 'etc', 'passwd']);
    expect(path).toBeNull();
  });
});
