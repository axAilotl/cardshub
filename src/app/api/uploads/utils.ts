import { join, normalize, sep } from 'path';

/**
 * Safely resolve a path inside the uploads directory.
 * Returns null if traversal or invalid segments are detected.
 */
export function safeResolveUploadPath(pathSegments: string[]): string | null {
  const invalidSegment = pathSegments.some(
    (seg) =>
      !seg ||
      seg === '.' ||
      seg === '..' ||
      seg.includes('..') ||
      seg.startsWith('/') ||
      seg.startsWith('\\')
  );
  if (invalidSegment) {
    return null;
  }

  const uploadsRoot = join(process.cwd(), 'uploads');
  const resolvedPath = normalize(join(uploadsRoot, ...pathSegments));

  if (!resolvedPath.startsWith(uploadsRoot + sep)) {
    return null;
  }

  return resolvedPath;
}
