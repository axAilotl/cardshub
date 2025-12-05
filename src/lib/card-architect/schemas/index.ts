export * from './schemas';
export * from './types';
export * from './asset-types';
export * from './voxta-types';

// Inline detectSpec to avoid ajv dependency
export function detectSpec(data: unknown): 'v2' | 'v3' | null {
  if (!data || typeof data !== 'object') return null;

  const obj = data as Record<string, unknown>;

  if (obj.spec === 'chara_card_v3') {
    return 'v3';
  }

  if (obj.spec === 'chara_card_v2') {
    return 'v2';
  }

  if (obj.spec_version === '2.0' || obj.spec_version === 2.0) {
    return 'v2';
  }

  if (obj.spec && obj.data && typeof obj.data === 'object') {
    const dataObj = obj.data as Record<string, unknown>;
    if (dataObj.name && typeof dataObj.name === 'string') {
      if (typeof obj.spec === 'string') {
        if (obj.spec.includes('v3') || obj.spec.includes('3')) {
          return 'v3';
        }
        if (obj.spec.includes('v2') || obj.spec.includes('2')) {
          return 'v2';
        }
      }
      return 'v3';
    }
  }

  if (obj.name && typeof obj.name === 'string') {
    if ('description' in obj || 'personality' in obj || 'scenario' in obj) {
      return 'v2';
    }
  }

  return null;
}
