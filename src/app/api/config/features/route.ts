import { NextResponse } from 'next/server';
import { isAssetPreviewsEnabled } from '@/lib/db/settings';

export async function GET() {
  try {
    const assetPreviewsEnabled = await isAssetPreviewsEnabled();
    return NextResponse.json({ assetPreviewsEnabled });
  } catch (error) {
    console.error('Error fetching feature flags:', error);
    // Fail-closed for safety (treat as disabled)
    return NextResponse.json({ assetPreviewsEnabled: false });
  }
}

