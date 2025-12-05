'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { AppShell } from '@/components/layout';
import { Button, Input } from '@/components/ui';
import { useAuth } from '@/lib/auth/context';
import { cn } from '@/lib/utils/cn';

type AuthMode = 'login' | 'register';

function AuthForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const oauthError = searchParams.get('error');
  const { login } = useAuth();

  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState(oauthError ? `OAuth error: ${oauthError}` : '');
  const [isLoading, setIsLoading] = useState(false);

  const handleDiscordLogin = () => {
    window.location.href = '/api/auth/discord';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (username.length < 3) {
        setError('Username must be at least 3 characters');
        return;
      }
      if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
        setError('Username can only contain letters, numbers, underscores, and hyphens');
        return;
      }
    }

    setIsLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || `${mode === 'login' ? 'Login' : 'Registration'} failed`);
        return;
      }

      // Update auth context
      login(data.user);

      // Redirect
      router.push(redirect);
      router.refresh();
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
    setConfirmPassword('');
  };

  return (
    <div className="max-w-md mx-auto mt-16">
      <div className="glass rounded-xl p-8">
        {/* Tabs */}
        <div className="flex mb-6 border-b border-nebula/20">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors relative',
              mode === 'login'
                ? 'text-nebula'
                : 'text-starlight/70 hover:text-starlight'
            )}
          >
            Login
            {mode === 'login' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-nebula" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setMode('register')}
            className={cn(
              'flex-1 py-3 text-sm font-medium transition-colors relative',
              mode === 'register'
                ? 'text-nebula'
                : 'text-starlight/70 hover:text-starlight'
            )}
          >
            Register
            {mode === 'register' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-nebula" />
            )}
          </button>
        </div>

        <h1 className="text-2xl font-bold gradient-text mb-6 text-center">
          {mode === 'login' ? 'Welcome Back' : 'Create Account'}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="username" className="block text-sm font-medium text-starlight/80 mb-1">
              Username
            </label>
            <Input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoComplete="username"
              minLength={3}
              maxLength={20}
            />
            {mode === 'register' && (
              <p className="text-xs text-starlight/50 mt-1">
                3-20 characters, letters, numbers, underscores, hyphens only
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-starlight/80 mb-1">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={6}
            />
            {mode === 'register' && (
              <p className="text-xs text-starlight/50 mt-1">
                At least 6 characters
              </p>
            )}
          </div>

          {mode === 'register' && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-starlight/80 mb-1">
                Confirm Password
              </label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                autoComplete="new-password"
              />
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={isLoading}
          >
            {isLoading
              ? (mode === 'login' ? 'Logging in...' : 'Creating account...')
              : (mode === 'login' ? 'Login' : 'Create Account')
            }
          </Button>
        </form>

        {/* OAuth separator */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-nebula/20" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-cosmic-teal text-starlight/60">or continue with</span>
          </div>
        </div>

        {/* Discord OAuth button */}
        <button
          type="button"
          onClick={handleDiscordLogin}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[#5865F2] hover:bg-[#4752C4] text-white rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
          </svg>
          Continue with Discord
        </button>

        <div className="mt-6 text-center text-sm text-starlight/60">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                type="button"
                onClick={switchMode}
                className="text-nebula hover:underline"
              >
                Register
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                type="button"
                onClick={switchMode}
                className="text-nebula hover:underline"
              >
                Login
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AppShell>
      <Suspense fallback={
        <div className="max-w-md mx-auto mt-16">
          <div className="glass rounded-xl p-8 animate-pulse">
            <div className="h-8 bg-cosmic-teal/50 rounded mb-6" />
            <div className="space-y-4">
              <div className="h-10 bg-cosmic-teal/50 rounded" />
              <div className="h-10 bg-cosmic-teal/50 rounded" />
              <div className="h-10 bg-cosmic-teal/50 rounded" />
            </div>
          </div>
        </div>
      }>
        <AuthForm />
      </Suspense>
    </AppShell>
  );
}
