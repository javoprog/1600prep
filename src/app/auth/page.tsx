'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button3D } from '@/components/ui/Button3D';
import {
  loadGuestResultsBuffer,
  loginWithEmail,
  registerWithEmail,
} from '@/services/api/backendApi';
import { soundEngine } from '@/services/sound/soundEngine';

export default function AuthPage() {
  const router = useRouter();
  const { user, isAuthLoading, handleAuthSuccess, activeSession } = useApp();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mode') === 'register') {
        setMode('register');
      }

      const buf = loadGuestResultsBuffer();
      let count = buf.attempts.length;
      if (count === 0 && activeSession) {
        count = Object.values(activeSession.questionStates).filter(
          (s) => s?.isSubmitted
        ).length;
      }
      setPendingCount(count);
    }
  }, [activeSession]);

  useEffect(() => {
    if (!isAuthLoading && user) {
      router.replace('/profile');
    }
  }, [isAuthLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const res =
        mode === 'register'
          ? await registerWithEmail({
              name: name.trim() || undefined,
              email: email.trim(),
              password,
            })
          : await loginWithEmail({
              email: email.trim(),
              password,
            });

      soundEngine.play('select');
      await handleAuthSuccess(res.token, res.user);
      router.push('/profile');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to connect to authentication server.'
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-12 sm:px-6 sm:py-16">
      {/* Back Link */}
      <div className="mb-8">
        <Link
          href="/"
          onClick={() => soundEngine.play('click')}
          className="inline-flex items-center gap-2 text-xs font-medium text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Practice</span>
        </Link>
      </div>

      {/* Editorial Header */}
      <div className="mb-6">
        <h1 className="font-editorial text-2xl sm:text-3xl tracking-tight text-[#F5F5F5]">
          {mode === 'login' ? 'Sign in to 1600prep' : 'Create your account'}
        </h1>
        <p className="mt-2 text-sm text-[#A1A1AA]">
          {mode === 'login'
            ? 'Access your saved SAT practice sessions, accuracy metrics, and mistake history.'
            : 'Accounts are optional and only used to save your practice results across sessions.'}
        </p>
      </div>

      {/* Unsaved Guest Session Notice */}
      {pendingCount > 0 && (
        <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-[#29292E] bg-[#111113] px-4 py-3 text-xs text-[#D4D4D8]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[#69ff00]" />
          <span>
            <strong className="font-semibold text-[#F5F5F5]">
              {pendingCount} answered question{pendingCount === 1 ? '' : 's'}
            </strong>{' '}
            from your current session will be saved to your account automatically.
          </span>
        </div>
      )}

      {/* Auth Card */}
      <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-6 sm:p-7">
        {/* Segmented Mode Switcher */}
        <div className="mb-6 grid grid-cols-2 rounded-xl border border-[#29292E] bg-[#0A0A0B] p-1">
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              setMode('login');
              setErrorMessage(null);
            }}
            className={`rounded-lg py-2 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-[#18181B] text-[#F5F5F5]'
                : 'text-[#71717A] hover:text-[#A1A1AA]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              setMode('register');
              setErrorMessage(null);
            }}
            className={`rounded-lg py-2 text-xs font-medium transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-[#18181B] text-[#F5F5F5]'
                : 'text-[#71717A] hover:text-[#A1A1AA]'
            }`}
          >
            Create Account
          </button>
        </div>

        {errorMessage && (
          <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label
                htmlFor="auth-name"
                className="mb-1.5 block text-xs font-medium text-[#A1A1AA]"
              >
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#52525B] transition-colors focus:border-[#69ff00] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label
              htmlFor="auth-email"
              className="mb-1.5 block text-xs font-medium text-[#A1A1AA]"
            >
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#52525B] transition-colors focus:border-[#69ff00] focus:outline-none"
            />
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="mb-1.5 block text-xs font-medium text-[#A1A1AA]"
            >
              Password
            </label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                autoComplete={
                  mode === 'register' ? 'new-password' : 'current-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimum 6 characters"
                className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] py-2.5 pl-3.5 pr-10 text-sm text-[#F5F5F5] placeholder-[#52525B] transition-colors focus:border-[#69ff00] focus:outline-none"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-[#71717A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div className="pt-2">
            <Button3D
              type="submit"
              variant="primary"
              size="lg"
              disabled={isSubmitting}
              className="w-full justify-center"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {mode === 'register'
                      ? 'Creating account...'
                      : 'Signing in...'}
                  </span>
                </>
              ) : (
                <>
                  <span>
                    {mode === 'register' ? 'Create Account' : 'Sign In'}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button3D>
          </div>
        </form>
      </div>

      {/* Subtle Optional Footer */}
      <p className="mt-6 text-center text-xs text-[#71717A]">
        Prefer not to sign in?{' '}
        <Link
          href="/"
          className="text-[#A1A1AA] underline decoration-[#29292E] underline-offset-4 hover:text-[#F5F5F5]"
        >
          Continue practicing as a guest
        </Link>
      </p>
    </div>
  );
}
