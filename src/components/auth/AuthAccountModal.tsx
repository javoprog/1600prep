'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Loader2,
  LogOut,
  Mail,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  authWithGoogle,
  authWithTelegramWidget,
  createTelegramBotSession,
  createTelegramLinkCode,
  linkEmailToAccount,
  linkGoogleToAccount,
  linkTelegramWidgetToAccount,
  loginWithEmail,
  pollTelegramBotSession,
  registerWithEmail,
  TelegramBotSessionResponse,
  TelegramLinkCodeResponse,
  TelegramWidgetPayload,
  unlinkProviderFromAccount,
} from '@/services/api/backendApi';
import { formatDuration } from '@/utils/formatTime';
import { soundEngine } from '@/services/sound/soundEngine';

declare global {
  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential?: string }) => void;
          }) => void;
          prompt: () => void;
          renderButton: (
            parent: HTMLElement,
            options: Record<string, unknown>
          ) => void;
        };
        oauth2?: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: { access_token?: string; error?: string }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
    onTelegramAuthCallback?: (user: TelegramWidgetPayload) => void;
  }
}

const GoogleIcon: React.FC<{ className?: string }> = ({ className = 'h-4 w-4' }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#EA4335"
      d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.8H12z"
    />
  </svg>
);

const TelegramIcon: React.FC<{ className?: string }> = ({
  className = 'h-4 w-4',
}) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
  </svg>
);

export const AuthAccountModal: React.FC = () => {
  const {
    user,
    authToken,
    authConfig,
    savedResults,
    isAuthModalOpen,
    authModalTab,
    openAuthModal,
    closeAuthModal,
    handleAuthSuccess,
    setUserProfile,
    refreshUserAndResults,
    clearSavedResults,
    logout,
    metas,
    startPracticeSession,
  } = useApp();

  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Telegram Bot session (for sign-in/register)
  const [showTelegramPanel, setShowTelegramPanel] = useState(false);
  const [telegramBotSession, setTelegramBotSession] =
    useState<TelegramBotSessionResponse | null>(null);
  const [isStartingTelegramBot, setIsStartingTelegramBot] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Account linking states (when logged in)
  const [showLinkEmailForm, setShowLinkEmailForm] = useState(false);
  const [linkEmailValue, setLinkEmailValue] = useState('');
  const [linkPasswordValue, setLinkPasswordValue] = useState('');
  const [telegramLinkData, setTelegramLinkData] =
    useState<TelegramLinkCodeResponse | null>(null);
  const [isLinkingProvider, setIsLinkingProvider] = useState<string | null>(
    null
  );
  const [isClearingHistory, setIsClearingHistory] = useState(false);

  const telegramWidgetLoginRef = useRef<HTMLDivElement | null>(null);
  const telegramWidgetLinkRef = useRef<HTMLDivElement | null>(null);

  const effectiveGoogleClientId =
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
    authConfig?.googleClientId ||
    null;

  const effectiveTelegramBotUsername =
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ||
    authConfig?.telegramBotUsername ||
    null;

  // Reset transient feedback when opening/closing modal
  useEffect(() => {
    if (!isAuthModalOpen) {
      setErrorMessage(null);
      setStatusMessage(null);
      setShowTelegramPanel(false);
      setTelegramBotSession(null);
      setTelegramLinkData(null);
      setShowLinkEmailForm(false);
    }
  }, [isAuthModalOpen]);

  // Load Google Identity Services script dynamically if client ID is available
  useEffect(() => {
    if (!isAuthModalOpen || !effectiveGoogleClientId) return;
    if (document.getElementById('google-gsi-script')) return;

    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, [isAuthModalOpen, effectiveGoogleClientId]);

  // Poll Telegram Bot login session every 2.5s while active
  useEffect(() => {
    if (!isAuthModalOpen || !telegramBotSession || user) return;

    const interval = setInterval(async () => {
      try {
        const res = await pollTelegramBotSession(
          telegramBotSession.sessionToken
        );
        if (res.status === 'COMPLETED') {
          clearInterval(interval);
          soundEngine.play('correct');
          await handleAuthSuccess(res.token, res.user);
          setTelegramBotSession(null);
          setShowTelegramPanel(false);
          openAuthModal('results');
        } else if (res.status === 'EXPIRED') {
          clearInterval(interval);
          setTelegramBotSession(null);
          setErrorMessage('Telegram login code expired. Please generate a new one.');
        }
      } catch {
        // Ignore transient poll errors
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [
    isAuthModalOpen,
    telegramBotSession,
    user,
    handleAuthSuccess,
    openAuthModal,
  ]);

  // Poll user profile every 2.5s while waiting for Telegram Bot account link code
  useEffect(() => {
    if (!isAuthModalOpen || !telegramLinkData || !user || user.telegramConnected) {
      return;
    }

    const interval = setInterval(async () => {
      await refreshUserAndResults();
    }, 2500);

    return () => clearInterval(interval);
  }, [isAuthModalOpen, telegramLinkData, user, refreshUserAndResults]);

  // Clear link code drawer once telegramConnected becomes true
  useEffect(() => {
    if (user?.telegramConnected && telegramLinkData) {
      setTelegramLinkData(null);
      setStatusMessage('Telegram account connected.');
    }
  }, [user?.telegramConnected, telegramLinkData]);

  // Inject official Telegram Login Widget when panel is open and bot username is configured
  const mountTelegramWidget = useCallback(
    (container: HTMLDivElement | null, mode: 'login' | 'link') => {
      if (!container || !effectiveTelegramBotUsername) return;
      container.innerHTML = '';

      window.onTelegramAuthCallback = async (payload: TelegramWidgetPayload) => {
        setErrorMessage(null);
        setIsSubmitting(true);
        try {
          if (mode === 'login') {
            const res = await authWithTelegramWidget(payload);
            await handleAuthSuccess(res.token, res.user);
            openAuthModal('results');
          } else if (authToken) {
            const updated = await linkTelegramWidgetToAccount(
              authToken,
              payload
            );
            setUserProfile(updated);
            setTelegramLinkData(null);
            setStatusMessage('Telegram account connected.');
          }
        } catch (err) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Telegram authentication failed'
          );
        } finally {
          setIsSubmitting(false);
        }
      };

      const script = document.createElement('script');
      script.src = 'https://telegram.org/js/telegram-widget.js?22';
      script.async = true;
      script.setAttribute('data-telegram-login', effectiveTelegramBotUsername);
      script.setAttribute('data-size', 'medium');
      script.setAttribute('data-radius', '8');
      script.setAttribute('data-onauth', 'onTelegramAuthCallback(user)');
      script.setAttribute('data-request-access', 'write');
      container.appendChild(script);
    },
    [
      effectiveTelegramBotUsername,
      authToken,
      handleAuthSuccess,
      openAuthModal,
      setUserProfile,
    ]
  );

  useEffect(() => {
    if (showTelegramPanel && !user && telegramWidgetLoginRef.current) {
      mountTelegramWidget(telegramWidgetLoginRef.current, 'login');
    }
  }, [showTelegramPanel, user, mountTelegramWidget]);

  useEffect(() => {
    if (telegramLinkData && user && telegramWidgetLinkRef.current) {
      mountTelegramWidget(telegramWidgetLinkRef.current, 'link');
    }
  }, [telegramLinkData, user, mountTelegramWidget]);

  if (!isAuthModalOpen) return null;

  const handleEmailAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const res =
        authMode === 'register'
          ? await registerWithEmail({
              name: name.trim() || undefined,
              email: email.trim(),
              password,
            })
          : await loginWithEmail({
              email: email.trim(),
              password,
            });

      soundEngine.play('click');
      await handleAuthSuccess(res.token, res.user);
      setPassword('');
      openAuthModal('results');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to authenticate. Make sure 1600prep-backend is running.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const triggerGoogleFlow = (mode: 'login' | 'link') => {
    setErrorMessage(null);
    setStatusMessage(null);

    if (!effectiveGoogleClientId) {
      setErrorMessage(
        'Set GOOGLE_CLIENT_ID in 1600prep-backend/.env (or NEXT_PUBLIC_GOOGLE_CLIENT_ID) to enable Google OAuth.'
      );
      return;
    }

    const oauth2 = window.google?.accounts?.oauth2;
    if (!oauth2) {
      setErrorMessage(
        'Google Identity Services is still loading. Please try again in a second.'
      );
      return;
    }

    setIsLinkingProvider('google');
    const tokenClient = oauth2.initTokenClient({
      client_id: effectiveGoogleClientId,
      scope: 'openid email profile',
      callback: async (response) => {
        if (response.error || !response.access_token) {
          setIsLinkingProvider(null);
          return;
        }
        try {
          if (mode === 'login') {
            const res = await authWithGoogle(response.access_token);
            await handleAuthSuccess(res.token, res.user);
            openAuthModal('results');
          } else if (authToken) {
            const updated = await linkGoogleToAccount(
              authToken,
              response.access_token
            );
            setUserProfile(updated);
            setStatusMessage('Google account connected.');
          }
        } catch (err) {
          setErrorMessage(
            err instanceof Error ? err.message : 'Google authentication failed'
          );
        } finally {
          setIsLinkingProvider(null);
        }
      },
    });

    tokenClient.requestAccessToken();
  };

  const handleStartTelegramBotLogin = async () => {
    setErrorMessage(null);
    setStatusMessage(null);
    setShowTelegramPanel(true);
    setIsStartingTelegramBot(true);

    try {
      const session = await createTelegramBotSession();
      setTelegramBotSession(session);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Unable to create Telegram login code. Check that 1600prep-backend is running.'
      );
    } finally {
      setIsStartingTelegramBot(false);
    }
  };

  const handleStartTelegramAccountLink = async () => {
    if (!authToken) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLinkingProvider('telegram');

    try {
      const linkData = await createTelegramLinkCode(authToken);
      setTelegramLinkData(linkData);
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to generate Telegram link code'
      );
    } finally {
      setIsLinkingProvider(null);
    }
  };

  const handleLinkEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLinkingProvider('email');

    try {
      const updated = await linkEmailToAccount(authToken, {
        email: linkEmailValue.trim(),
        password: linkPasswordValue,
      });
      setUserProfile(updated);
      setShowLinkEmailForm(false);
      setLinkPasswordValue('');
      setStatusMessage('Email & password connected to your account.');
      await refreshUserAndResults();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Failed to connect email & password'
      );
    } finally {
      setIsLinkingProvider(null);
    }
  };

  const handleUnlinkProvider = async (
    provider: 'google' | 'telegram' | 'password'
  ) => {
    if (!authToken) return;
    setErrorMessage(null);
    setStatusMessage(null);
    setIsLinkingProvider(provider);

    try {
      const updated = await unlinkProviderFromAccount(authToken, provider);
      setUserProfile(updated);
      setStatusMessage('Sign-in method disconnected.');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Cannot disconnect provider'
      );
    } finally {
      setIsLinkingProvider(null);
    }
  };

  const handleCopyCode = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    }
  };

  const handlePracticeSavedMistakes = async () => {
    if (!savedResults || savedResults.mistakeQuestionIds.length === 0) return;
    const mistakeIds = savedResults.mistakeQuestionIds;
    const firstMeta = metas.find((m) => mistakeIds.includes(m.id));
    const subject = firstMeta?.subject || 'math';
    const subjectMistakeIds = metas
      .filter((m) => m.subject === subject && mistakeIds.includes(m.id))
      .map((m) => m.id);

    const targetIds =
      subjectMistakeIds.length > 0 ? subjectMistakeIds : mistakeIds;

    try {
      await startPracticeSession(
        {
          subject,
          domains: [],
          skills: [],
          difficulties: ['E', 'M', 'H'],
          difficulty: 'ALL',
        },
        'mistakes',
        'Saved Mistakes Review',
        targetIds
      );
      closeAuthModal();
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Unable to start mistakes session'
      );
    }
  };

  const connectedMethodsCount = user
    ? [
        Boolean(user.hasPassword && user.email),
        Boolean(user.googleConnected),
        Boolean(user.telegramConnected),
      ].filter(Boolean).length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={closeAuthModal}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#29292E] bg-[#111113] text-[#F5F5F5] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-[#1F1F23] px-6 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-[#F5F5F5]">
              {user ? user.name : 'Save Your Practice Results'}
            </h2>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">
              {user
                ? user.email ||
                  (user.telegramUsername
                    ? `@${user.telegramUsername}`
                    : 'Connected account')
                : 'Optional — practice works without an account. Sign in only to save results.'}
            </p>
          </div>
          <button
            type="button"
            onClick={closeAuthModal}
            aria-label="Close modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation Tabs when Signed In */}
        {user && (
          <div className="flex border-b border-[#1F1F23] bg-[#0A0A0B]/50 px-6">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStatusMessage(null);
                openAuthModal('results');
              }}
              className={`relative py-3 text-xs font-medium transition-colors cursor-pointer mr-6 ${
                authModalTab !== 'account'
                  ? 'text-[#F5F5F5]'
                  : 'text-[#71717A] hover:text-[#A1A1AA]'
              }`}
            >
              Saved Results
              {authModalTab !== 'account' && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#69ff00]" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStatusMessage(null);
                openAuthModal('account');
              }}
              className={`relative py-3 text-xs font-medium transition-colors cursor-pointer ${
                authModalTab === 'account'
                  ? 'text-[#F5F5F5]'
                  : 'text-[#71717A] hover:text-[#A1A1AA]'
              }`}
            >
              Connected Logins ({connectedMethodsCount}/3)
              {authModalTab === 'account' && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-[#69ff00]" />
              )}
            </button>
          </div>
        )}

        {/* Modal Body */}
        <div className="max-h-[78vh] overflow-y-auto p-6">
          {errorMessage && (
            <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-xs text-rose-200">
              {errorMessage}
            </div>
          )}

          {statusMessage && (
            <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
              {statusMessage}
            </div>
          )}

          {/* ================================================================
              SIGNED-OUT VIEW: EMAIL, GOOGLE, OR TELEGRAM AUTH
             ================================================================ */}
          {!user && (
            <div>
              {/* Mode Toggle */}
              <div className="mb-5 grid grid-cols-2 rounded-xl border border-[#29292E] bg-[#0A0A0B] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setErrorMessage(null);
                  }}
                  className={`rounded-lg py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    authMode === 'login'
                      ? 'bg-[#18181B] text-[#F5F5F5]'
                      : 'text-[#71717A] hover:text-[#A1A1AA]'
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setErrorMessage(null);
                  }}
                  className={`rounded-lg py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    authMode === 'register'
                      ? 'bg-[#18181B] text-[#F5F5F5]'
                      : 'text-[#71717A] hover:text-[#A1A1AA]'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Email & Password Form */}
              <form onSubmit={handleEmailAuthSubmit} className="space-y-3">
                {authMode === 'register' && (
                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-[#A1A1AA]">
                      Name (optional)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Alex"
                      className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#52525B] focus:border-[#69ff00] focus:outline-none"
                    />
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#A1A1AA]">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#52525B] focus:border-[#69ff00] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-[11px] font-medium text-[#A1A1AA]">
                    Password
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] placeholder-[#52525B] focus:border-[#69ff00] focus:outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#69ff00] px-4 py-2.5 text-xs font-semibold text-[#0A0A0B] hover:bg-[#5ce000] disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : authMode === 'register' ? (
                    'Create Account & Save Results'
                  ) : (
                    'Sign In with Email'
                  )}
                </button>
              </form>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#1F1F23]" />
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#71717A]">
                  or continue with
                </span>
                <div className="h-px flex-1 bg-[#1F1F23]" />
              </div>

              {/* Social Auth Buttons: Google & Telegram */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => triggerGoogleFlow('login')}
                  disabled={isLinkingProvider === 'google'}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#29292E] bg-[#18181B] px-3.5 py-2.5 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] hover:bg-[#1F1F23] transition-colors cursor-pointer"
                >
                  {isLinkingProvider === 'google' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <GoogleIcon />
                  )}
                  <span>Google</span>
                </button>

                <button
                  type="button"
                  onClick={handleStartTelegramBotLogin}
                  disabled={isStartingTelegramBot}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[#29292E] bg-[#18181B] px-3.5 py-2.5 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] hover:bg-[#1F1F23] transition-colors cursor-pointer"
                >
                  {isStartingTelegramBot ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <TelegramIcon className="h-4 w-4 text-[#38BDF8]" />
                  )}
                  <span>Telegram</span>
                </button>
              </div>

              {/* Telegram Bot Code & Widget Drawer */}
              {showTelegramPanel && (
                <div className="mt-4 rounded-xl border border-[#29292E] bg-[#0A0A0B] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#F5F5F5]">
                      Sign in with Telegram
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-[#A1A1AA]">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#69ff00] animate-pulse" />
                      Waiting for confirmation
                    </span>
                  </div>

                  {telegramBotSession && (
                    <div className="mt-3 space-y-3">
                      <p className="text-xs text-[#A1A1AA]">
                        Send this 6-digit code to our Telegram bot
                        {telegramBotSession.botUsername
                          ? ` (@${telegramBotSession.botUsername})`
                          : ''}{' '}
                        or open the direct link below:
                      </p>

                      <div className="flex items-center justify-between rounded-xl border border-[#29292E] bg-[#111113] px-3.5 py-2.5">
                        <span className="font-mono text-lg font-semibold tracking-widest text-[#F5F5F5]">
                          {telegramBotSession.code}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyCode(telegramBotSession.code)
                            }
                            className="flex items-center gap-1 rounded-lg border border-[#29292E] bg-[#18181B] px-2.5 py-1 text-[11px] text-[#D4D4D8] hover:text-[#F5F5F5] cursor-pointer"
                          >
                            {copiedCode ? (
                              <>
                                <Check className="h-3 w-3 text-[#69ff00]" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3 w-3" />
                                Copy
                              </>
                            )}
                          </button>

                          {telegramBotSession.deepLink && (
                            <a
                              href={telegramBotSession.deepLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 rounded-lg bg-[#38BDF8]/15 px-2.5 py-1 text-[11px] font-medium text-[#38BDF8] hover:bg-[#38BDF8]/25"
                            >
                              Open Bot
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {effectiveTelegramBotUsername && (
                    <div className="mt-3 border-t border-[#1F1F23] pt-3">
                      <p className="mb-2 text-[11px] text-[#71717A]">
                        Or use the Telegram Web Login Widget:
                      </p>
                      <div ref={telegramWidgetLoginRef} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ================================================================
              SIGNED-IN VIEW TAB 1: SAVED RESULTS
             ================================================================ */}
          {user && authModalTab !== 'account' && (
            <div className="space-y-6">
              {/* Top Metric Strip */}
              <div className="grid grid-cols-2 gap-4 rounded-xl border border-[#29292E] bg-[#0A0A0B] p-4 sm:grid-cols-4">
                <div>
                  <div className="text-[11px] text-[#A1A1AA]">Total Solved</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-[#F5F5F5]">
                    {savedResults?.totalAttempts ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#A1A1AA]">Accuracy</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-[#F5F5F5]">
                    {savedResults?.accuracyPercent ?? 0}%
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#A1A1AA]">R&W</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-[#F5F5F5]">
                    {savedResults?.bySubject.rw.accuracyPercent ?? 0}%
                    <span className="ml-1 text-xs font-normal text-[#71717A]">
                      ({savedResults?.bySubject.rw.correct ?? 0}/
                      {savedResults?.bySubject.rw.total ?? 0})
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#A1A1AA]">Math</div>
                  <div className="mt-1 font-mono text-xl font-semibold text-[#F5F5F5]">
                    {savedResults?.bySubject.math.accuracyPercent ?? 0}%
                    <span className="ml-1 text-xs font-normal text-[#71717A]">
                      ({savedResults?.bySubject.math.correct ?? 0}/
                      {savedResults?.bySubject.math.total ?? 0})
                    </span>
                  </div>
                </div>
              </div>

              {/* Saved Mistakes Quick Practice Action */}
              {savedResults && savedResults.mistakeQuestionIds.length > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-[#29292E] bg-[#18181B]/70 px-4 py-3">
                  <div>
                    <div className="text-xs font-medium text-[#F5F5F5]">
                      {savedResults.mistakeQuestionIds.length} Saved Mistake
                      {savedResults.mistakeQuestionIds.length === 1 ? '' : 's'}
                    </div>
                    <div className="text-[11px] text-[#A1A1AA]">
                      Review questions you previously missed across sessions.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePracticeSavedMistakes}
                    className="flex items-center gap-1.5 rounded-lg bg-[#69ff00] px-3 py-1.5 text-xs font-semibold text-[#0A0A0B] hover:bg-[#5ce000] transition-colors cursor-pointer"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Practice Mistakes
                  </button>
                </div>
              )}

              {/* Recent Saved Sessions */}
              <div>
                <div className="mb-2.5 flex items-center justify-between">
                  <h3 className="text-xs font-medium uppercase tracking-wider text-[#A1A1AA]">
                    Recent Saved Sessions
                  </h3>
                  {savedResults && savedResults.totalAttempts > 0 && (
                    <button
                      type="button"
                      disabled={isClearingHistory}
                      onClick={async () => {
                        setIsClearingHistory(true);
                        try {
                          await clearSavedResults();
                          setStatusMessage('Saved results history cleared.');
                        } finally {
                          setIsClearingHistory(false);
                        }
                      }}
                      className="flex items-center gap-1 text-[11px] text-[#71717A] hover:text-rose-400 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      Clear history
                    </button>
                  )}
                </div>

                {!savedResults || savedResults.recentSessions.length === 0 ? (
                  <div className="rounded-xl border border-[#1F1F23] bg-[#0A0A0B] px-4 py-8 text-center text-xs text-[#71717A]">
                    No completed sessions saved yet. Complete a practice session
                    and your results will appear here automatically.
                  </div>
                ) : (
                  <div className="divide-y divide-[#1F1F23] rounded-xl border border-[#29292E] bg-[#0A0A0B]">
                    {savedResults.recentSessions.slice(0, 10).map((sess) => {
                      const acc =
                        sess.answeredCount > 0
                          ? Math.round(
                              (sess.correctCount / sess.answeredCount) * 100
                            )
                          : 0;
                      return (
                        <div
                          key={sess.id}
                          className="flex items-center justify-between px-4 py-3 text-xs"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="truncate font-medium text-[#F5F5F5]">
                              {sess.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[#71717A]">
                              <span>
                                {sess.subject === 'rw'
                                  ? 'Reading & Writing'
                                  : 'Math'}
                              </span>
                              <span>·</span>
                              <span>{formatDuration(sess.totalTime)}</span>
                            </div>
                          </div>
                          <div className="shrink-0 text-right font-mono">
                            <span className="font-medium text-[#F5F5F5]">
                              {sess.correctCount}/{sess.answeredCount}
                            </span>
                            <span className="ml-2 text-[#A1A1AA]">
                              ({acc}%)
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================
              SIGNED-IN VIEW TAB 2: ACCOUNT & CROSS-PROVIDER LINKING
             ================================================================ */}
          {user && authModalTab === 'account' && (
            <div className="space-y-4">
              <p className="text-xs text-[#A1A1AA]">
                Connect any combination of Email, Google, and Telegram to your
                account so you can sign in with whichever method you prefer.
              </p>

              {/* 1. Email & Password Card */}
              <div className="rounded-xl border border-[#29292E] bg-[#0A0A0B] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29292E] bg-[#18181B]">
                      <Mail className="h-4 w-4 text-[#F5F5F5]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium text-[#F5F5F5]">
                        <span>Email & Password</span>
                        {user.hasPassword && user.email && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#29292E] bg-[#18181B] px-2 py-0.5 text-[10px] text-[#D4D4D8]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#A1A1AA]">
                        {user.hasPassword && user.email
                          ? user.email
                          : 'Not set — add an email and password to sign in directly'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setShowLinkEmailForm((prev) => !prev);
                        setLinkEmailValue(user.email || '');
                      }}
                      className="rounded-lg border border-[#29292E] bg-[#18181B] px-3 py-1.5 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] cursor-pointer"
                    >
                      {user.hasPassword ? 'Update' : 'Connect'}
                    </button>

                    {user.hasPassword && connectedMethodsCount > 1 && (
                      <button
                        type="button"
                        disabled={isLinkingProvider === 'password'}
                        onClick={() => handleUnlinkProvider('password')}
                        className="rounded-lg border border-[#29292E] px-2.5 py-1.5 text-xs text-[#A1A1AA] hover:text-rose-400 cursor-pointer"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {showLinkEmailForm && (
                  <form
                    onSubmit={handleLinkEmailSubmit}
                    className="mt-3 space-y-2.5 border-t border-[#1F1F23] pt-3"
                  >
                    <input
                      type="email"
                      required
                      value={linkEmailValue}
                      onChange={(e) => setLinkEmailValue(e.target.value)}
                      placeholder="Email address"
                      className="w-full rounded-lg border border-[#29292E] bg-[#111113] px-3 py-2 text-xs text-[#F5F5F5] placeholder-[#52525B] focus:border-[#69ff00] focus:outline-none"
                    />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={linkPasswordValue}
                      onChange={(e) => setLinkPasswordValue(e.target.value)}
                      placeholder="Password (at least 6 characters)"
                      className="w-full rounded-lg border border-[#29292E] bg-[#111113] px-3 py-2 text-xs text-[#F5F5F5] placeholder-[#52525B] focus:border-[#69ff00] focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowLinkEmailForm(false)}
                        className="rounded-lg px-3 py-1.5 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isLinkingProvider === 'email'}
                        className="rounded-lg bg-[#69ff00] px-3 py-1.5 text-xs font-semibold text-[#0A0A0B] hover:bg-[#5ce000] cursor-pointer"
                      >
                        {isLinkingProvider === 'email'
                          ? 'Saving...'
                          : 'Save Email & Password'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* 2. Google Account Card */}
              <div className="rounded-xl border border-[#29292E] bg-[#0A0A0B] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29292E] bg-[#18181B]">
                      <GoogleIcon />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium text-[#F5F5F5]">
                        <span>Google</span>
                        {user.googleConnected && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#29292E] bg-[#18181B] px-2 py-0.5 text-[10px] text-[#D4D4D8]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#A1A1AA]">
                        {user.googleConnected
                          ? user.googleEmail || user.email || 'Google linked'
                          : 'Not connected'}
                      </div>
                    </div>
                  </div>

                  <div>
                    {user.googleConnected ? (
                      connectedMethodsCount > 1 && (
                        <button
                          type="button"
                          disabled={isLinkingProvider === 'google'}
                          onClick={() => handleUnlinkProvider('google')}
                          className="rounded-lg border border-[#29292E] px-2.5 py-1.5 text-xs text-[#A1A1AA] hover:text-rose-400 cursor-pointer"
                        >
                          Disconnect
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={isLinkingProvider === 'google'}
                        onClick={() => triggerGoogleFlow('link')}
                        className="rounded-lg border border-[#29292E] bg-[#18181B] px-3 py-1.5 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] cursor-pointer"
                      >
                        {isLinkingProvider === 'google'
                          ? 'Connecting...'
                          : 'Connect Google'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. Telegram Account Card */}
              <div className="rounded-xl border border-[#29292E] bg-[#0A0A0B] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#29292E] bg-[#18181B]">
                      <TelegramIcon className="h-4 w-4 text-[#38BDF8]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-xs font-medium text-[#F5F5F5]">
                        <span>Telegram</span>
                        {user.telegramConnected && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#29292E] bg-[#18181B] px-2 py-0.5 text-[10px] text-[#D4D4D8]">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                            Connected
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[#A1A1AA]">
                        {user.telegramConnected
                          ? user.telegramUsername
                            ? `@${user.telegramUsername}`
                            : user.telegramFirstName ||
                              `ID ${user.telegramId}`
                          : 'Not connected'}
                      </div>
                    </div>
                  </div>

                  <div>
                    {user.telegramConnected ? (
                      connectedMethodsCount > 1 && (
                        <button
                          type="button"
                          disabled={isLinkingProvider === 'telegram'}
                          onClick={() => handleUnlinkProvider('telegram')}
                          className="rounded-lg border border-[#29292E] px-2.5 py-1.5 text-xs text-[#A1A1AA] hover:text-rose-400 cursor-pointer"
                        >
                          Disconnect
                        </button>
                      )
                    ) : (
                      <button
                        type="button"
                        disabled={isLinkingProvider === 'telegram'}
                        onClick={handleStartTelegramAccountLink}
                        className="rounded-lg border border-[#29292E] bg-[#18181B] px-3 py-1.5 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] cursor-pointer"
                      >
                        {isLinkingProvider === 'telegram'
                          ? 'Generating...'
                          : 'Connect Telegram'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Telegram Link Code & Widget */}
                {telegramLinkData && !user.telegramConnected && (
                  <div className="mt-3 space-y-2.5 border-t border-[#1F1F23] pt-3">
                    <p className="text-xs text-[#A1A1AA]">
                      Send this 6-digit code to our Telegram bot
                      {telegramLinkData.botUsername
                        ? ` (@${telegramLinkData.botUsername})`
                        : ''}{' '}
                      to link Telegram to your account:
                    </p>
                    <div className="flex items-center justify-between rounded-lg border border-[#29292E] bg-[#111113] px-3 py-2">
                      <span className="font-mono text-base font-semibold tracking-widest text-[#F5F5F5]">
                        {telegramLinkData.code}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyCode(telegramLinkData.code)}
                          className="flex items-center gap-1 rounded-md border border-[#29292E] bg-[#18181B] px-2 py-1 text-[11px] text-[#D4D4D8] cursor-pointer"
                        >
                          {copiedCode ? (
                            <>
                              <Check className="h-3 w-3 text-[#69ff00]" />
                              Copied
                            </>
                          ) : (
                            <>
                              <Copy className="h-3 w-3" />
                              Copy
                            </>
                          )}
                        </button>
                        {telegramLinkData.deepLink && (
                          <a
                            href={telegramLinkData.deepLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 rounded-md bg-[#38BDF8]/15 px-2.5 py-1 text-[11px] font-medium text-[#38BDF8]"
                          >
                            Open Bot
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    </div>

                    {effectiveTelegramBotUsername && (
                      <div className="pt-2">
                        <div ref={telegramWidgetLinkRef} />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sign Out Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={logout}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#29292E] bg-[#18181B] px-4 py-2.5 text-xs font-medium text-[#D4D4D8] hover:border-rose-500/40 hover:text-rose-300 transition-colors cursor-pointer"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
