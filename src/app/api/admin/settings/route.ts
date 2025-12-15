import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import {
  getAllSettings,
  setSetting,
  SETTING_KEYS,
  type SettingKey,
} from '@/lib/db/settings';

/**
 * GET /api/admin/settings
 * Get all admin settings
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session || !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const settings = await getAllSettings();

    return NextResponse.json({ settings });
  } catch (error) {
    console.error('Error fetching admin settings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/settings
 * Update a single setting
 * Body: { key: string, value: string }
 */
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session || !session.user.isAdmin) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { key, value } = body;

    if (!key || typeof key !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid key' },
        { status: 400 }
      );
    }

    if (value === undefined || typeof value !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid value' },
        { status: 400 }
      );
    }

    // Validate key is a known setting
    const validKeys = Object.values(SETTING_KEYS);
    if (!validKeys.includes(key as SettingKey)) {
      return NextResponse.json(
        { error: `Unknown setting key: ${key}` },
        { status: 400 }
      );
    }

    await setSetting(key as SettingKey, value, session.user.id);

    return NextResponse.json({ success: true, key, value });
  } catch (error) {
    console.error('Error updating admin setting:', error);
    return NextResponse.json(
      { error: 'Failed to update setting' },
      { status: 500 }
    );
  }
}
