'use client';

import { SettingsProvider } from '@/lib/settings';
import { AuthProvider } from '@/lib/auth/context';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SettingsProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </SettingsProvider>
  );
}
