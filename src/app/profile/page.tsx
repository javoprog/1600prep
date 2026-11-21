'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Check,
  Loader2,
  LogOut,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button3D } from '@/components/ui/Button3D';
import {
  changeUserPassword,
  deleteUserAccount,
  updateUserProfile,
} from '@/services/api/backendApi';
import {
  formatDuration,
  formatShortDuration,
  getDifficultyBadgeInfo,
} from '@/utils/formatTime';
import { DifficultyCode } from '@/types';
import { soundEngine } from '@/services/sound/soundEngine';

function formatShortDate(epochMs: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(epochMs));
  } catch {
    return '';
  }
}

export default function ProfilePage() {
  const router = useRouter();
  const {
    user,
    authToken,
    isAuthLoading,
    savedResults,
    setUserProfile,
    refreshUserAndResults,
    clearSavedResults,
    logout,
    metas,
    metaMap,
    startPracticeSession,
    closeActiveSession,
    triggerWizardReset,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'overview' | 'settings'>(
    'overview'
  );
  const [historyTab, setHistoryTab] = useState<'sessions' | 'questions'>(
    'sessions'
  );

  // Profile form state
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSavingPassword, setIsSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Two-step confirmation flags
  const [confirmClearHistory, setConfirmClearHistory] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  useEffect(() => {
    if (!isAuthLoading && !user) {
      router.replace('/auth');
    }
  }, [isAuthLoading, user, router]);

  useEffect(() => {
    if (user) {
      setProfileName(user.name);
      setProfileEmail(user.email);
      refreshUserAndResults();
    }
  }, [user?.id, refreshUserAndResults]);

  if (isAuthLoading || !user) {
    return (
      <div className="mx-auto flex max-w-4xl items-center justify-center px-4 py-24 sm:px-6">
        <Loader2 className="h-5 w-5 animate-spin text-[#A1A1AA]" />
      </div>
    );
  }

  const totalAttempts = savedResults?.totalAttempts ?? 0;
  const correctAttempts = savedResults?.correctAttempts ?? 0;
  const accuracyPercent = savedResults?.accuracyPercent ?? 0;
  const uniqueSolved = savedResults?.uniqueQuestionsSolved ?? 0;
  const totalTimeMs = savedResults?.totalTimeMs ?? 0;
  const mistakeIds = savedResults?.mistakeQuestionIds ?? [];
  const rwStats = savedResults?.bySubject.rw ?? {
    total: 0,
    correct: 0,
    accuracyPercent: 0,
  };
  const mathStats = savedResults?.bySubject.math ?? {
    total: 0,
    correct: 0,
    accuracyPercent: 0,
  };
  const recentSessions = savedResults?.recentSessions ?? [];
  const recentAttempts = savedResults?.recentAttempts ?? [];

  const handlePracticeSavedMistakes = async () => {
    if (mistakeIds.length === 0) return;
    const firstMeta = metas.find((m) => mistakeIds.includes(m.id));
    const subject = firstMeta?.subject || 'math';
    const subjectMistakes = metas
      .filter((m) => m.subject === subject && mistakeIds.includes(m.id))
      .map((m) => m.id);
    const targetIds =
      subjectMistakes.length > 0 ? subjectMistakes : mistakeIds;

    try {
      soundEngine.play('select');
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
      router.push('/');
    } catch {
      // Ignore if catalog not yet loaded
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setProfileFeedback(null);
    setIsSavingProfile(true);

    try {
      const updated = await updateUserProfile(authToken, {
        name: profileName.trim(),
        email: profileEmail.trim(),
      });
      setUserProfile(updated);
      setProfileFeedback({
        type: 'success',
        text: 'Profile details updated.',
      });
    } catch (err) {
      setProfileFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to update profile.',
      });
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!authToken) return;
    setPasswordFeedback(null);
    setIsSavingPassword(true);

    try {
      await changeUserPassword(authToken, {
        currentPassword,
        newPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setPasswordFeedback({
        type: 'success',
        text: 'Password updated.',
      });
    } catch (err) {
      setPasswordFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Failed to change password.',
      });
    } finally {
      setIsSavingPassword(false);
    }
  };

  const handleConfirmClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      await clearSavedResults();
      setConfirmClearHistory(false);
    } finally {
      setIsClearingHistory(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (!authToken) return;
    setIsDeletingAccount(true);
    try {
      await deleteUserAccount(authToken);
      logout();
      router.replace('/');
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const memberSince = user.createdAt
    ? formatShortDate(new Date(user.createdAt).getTime())
    : '';

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 sm:py-12">
      {/* Top Navigation Row */}
      <div className="mb-8 flex items-center justify-between">
        <Link
          href="/"
          onClick={() => soundEngine.play('click')}
          className="inline-flex items-center gap-2 text-xs font-medium text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Practice</span>
        </Link>

        <button
          type="button"
          onClick={() => {
            soundEngine.play('click');
            logout();
            router.push('/');
          }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors cursor-pointer"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span>Sign out</span>
        </button>
      </div>

      {/* Editorial Header */}
      <div className="border-b border-[#1F1F23] pb-6">
        <p className="text-xs font-medium text-[#A1A1AA]">
          Student Profile {memberSince ? `• Member since ${memberSince}` : ''}
        </p>

        <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-baseline">
          <div>
            <h1 className="font-editorial text-2xl sm:text-3xl tracking-tight text-[#F5F5F5]">
              {user.name}
            </h1>
            <p className="mt-1 text-sm text-[#A1A1AA]">{user.email}</p>
          </div>

          <div className="sm:text-right">
            <div className="font-editorial text-3xl sm:text-4xl tabular-nums text-[#69ff00]">
              {accuracyPercent}%
            </div>
            <div className="mt-0.5 text-xs text-[#71717A]">
              Overall Accuracy
            </div>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="mt-8 flex items-center gap-6 border-t border-[#1F1F23] pt-4">
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              setActiveTab('overview');
            }}
            className={`text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'overview'
                ? 'text-[#F5F5F5]'
                : 'text-[#71717A] hover:text-[#A1A1AA]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {activeTab === 'overview' && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#69ff00]" />
              )}
              <span>Performance & History</span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              setActiveTab('settings');
            }}
            className={`text-xs font-medium transition-colors cursor-pointer ${
              activeTab === 'settings'
                ? 'text-[#F5F5F5]'
                : 'text-[#71717A] hover:text-[#A1A1AA]'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {activeTab === 'settings' && (
                <span className="h-1.5 w-1.5 rounded-full bg-[#69ff00]" />
              )}
              <span>Account Settings</span>
            </span>
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAB 1: PERFORMANCE & HISTORY
         ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="mt-8 space-y-10">
          {/* Typography-Driven Metrics Strip */}
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <div className="text-xs text-[#71717A]">Questions Answered</div>
              <div className="mt-1 text-lg font-medium tabular-nums text-[#F5F5F5]">
                {totalAttempts}{' '}
                <span className="text-xs font-normal text-[#71717A]">
                  ({uniqueSolved} unique)
                </span>
              </div>
            </div>

            <div>
              <div className="text-xs text-[#71717A]">Correct Answers</div>
              <div className="mt-1 text-lg font-medium tabular-nums text-emerald-400">
                {correctAttempts}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#71717A]">Open Mistakes</div>
              <div
                className={`mt-1 text-lg font-medium tabular-nums ${
                  mistakeIds.length > 0 ? 'text-red-400' : 'text-[#F5F5F5]'
                }`}
              >
                {mistakeIds.length}
              </div>
            </div>

            <div>
              <div className="text-xs text-[#71717A]">Total Study Time</div>
              <div className="mt-1 text-lg font-medium tabular-nums text-[#F5F5F5]">
                {formatDuration(totalTimeMs)}
              </div>
            </div>
          </div>

          {/* Subject Breakdown Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-[#F5F5F5]">
                  Reading & Writing
                </span>
                <span className="font-mono text-lg font-semibold tabular-nums text-[#F5F5F5]">
                  {rwStats.accuracyPercent}%
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#1F1F23]">
                <div
                  className="h-full rounded-full bg-[#69ff00] transition-all duration-500"
                  style={{ width: `${rwStats.accuracyPercent}%` }}
                />
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs text-[#71717A]">
                <span>
                  {rwStats.correct} correct of {rwStats.total} answered
                </span>
              </div>
            </div>

            <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium text-[#F5F5F5]">Math</span>
                <span className="font-mono text-lg font-semibold tabular-nums text-[#F5F5F5]">
                  {mathStats.accuracyPercent}%
                </span>
              </div>
              <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[#1F1F23]">
                <div
                  className="h-full rounded-full bg-[#69ff00] transition-all duration-500"
                  style={{ width: `${mathStats.accuracyPercent}%` }}
                />
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs text-[#71717A]">
                <span>
                  {mathStats.correct} correct of {mathStats.total} answered
                </span>
              </div>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="flex flex-wrap items-center gap-3">
            <Button3D
              variant="primary"
              size="lg"
              onClick={() => {
                closeActiveSession();
                triggerWizardReset();
                router.push('/');
              }}
            >
              <Plus className="h-4 w-4" />
              <span>New Practice Session</span>
            </Button3D>

            {mistakeIds.length > 0 && (
              <Button3D
                variant="secondary"
                size="lg"
                onClick={handlePracticeSavedMistakes}
              >
                <RotateCcw className="h-4 w-4" />
                <span>Review Saved Mistakes ({mistakeIds.length})</span>
              </Button3D>
            )}
          </div>

          {/* Saved Sessions & Question History */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.play('click');
                    setHistoryTab('sessions');
                  }}
                  className={`text-xs font-medium transition-colors cursor-pointer ${
                    historyTab === 'sessions'
                      ? 'text-[#F5F5F5]'
                      : 'text-[#71717A] hover:text-[#A1A1AA]'
                  }`}
                >
                  Saved Sessions ({recentSessions.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.play('click');
                    setHistoryTab('questions');
                  }}
                  className={`text-xs font-medium transition-colors cursor-pointer ${
                    historyTab === 'questions'
                      ? 'text-[#F5F5F5]'
                      : 'text-[#71717A] hover:text-[#A1A1AA]'
                  }`}
                >
                  Recent Questions ({recentAttempts.length})
                </button>
              </div>
            </div>

            {historyTab === 'sessions' ? (
              recentSessions.length === 0 ? (
                <div className="rounded-2xl border border-[#29292E] bg-[#111113] px-6 py-12 text-center">
                  <p className="text-sm font-medium text-[#F5F5F5]">
                    No saved sessions yet
                  </p>
                  <p className="mt-1 text-xs text-[#71717A]">
                    Complete a practice session and your results will be logged
                    here automatically.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#1F1F23] rounded-2xl border border-[#29292E] bg-[#111113]">
                  {recentSessions.map((sess, idx) => {
                    const acc =
                      sess.answeredCount > 0
                        ? Math.round(
                            (sess.correctCount / sess.answeredCount) * 100
                          )
                        : 0;
                    return (
                      <div
                        key={sess.id}
                        className="flex items-center justify-between gap-4 px-5 py-4"
                      >
                        <div className="flex min-w-0 items-center gap-4">
                          <span className="w-6 font-mono text-xs text-[#71717A]">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-[#F5F5F5]">
                              {sess.title}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-xs text-[#71717A]">
                              <span>
                                {sess.subject === 'rw'
                                  ? 'Reading & Writing'
                                  : 'Math'}
                              </span>
                              <span>•</span>
                              <span>{formatShortDate(sess.startedAt)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0 text-right text-xs">
                          <div className="font-mono font-medium text-[#F5F5F5]">
                            {sess.correctCount}/{sess.answeredCount}{' '}
                            <span className="text-[#A1A1AA]">({acc}%)</span>
                          </div>
                          <div className="mt-0.5 tabular-nums text-[#71717A]">
                            {formatDuration(sess.totalTime)}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            ) : recentAttempts.length === 0 ? (
              <div className="rounded-2xl border border-[#29292E] bg-[#111113] px-6 py-12 text-center">
                <p className="text-sm font-medium text-[#F5F5F5]">
                  No question attempts saved yet
                </p>
                <p className="mt-1 text-xs text-[#71717A]">
                  Every question you submit while signed in is recorded here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#1F1F23] rounded-2xl border border-[#29292E] bg-[#111113]">
                {recentAttempts.map((att, idx) => {
                  const meta = metaMap.get(att.questionId);
                  const diffCode = (att.difficulty ||
                    meta?.difficulty ||
                    null) as DifficultyCode | null;
                  const diff = getDifficultyBadgeInfo(diffCode);
                  const correctLabel =
                    att.correctAnswer && att.correctAnswer.length > 0
                      ? att.correctAnswer.join(' or ')
                      : null;

                  return (
                    <button
                      key={att.id}
                      type="button"
                      onClick={() => {
                        soundEngine.play('click');
                        router.push(
                          `/?question=${encodeURIComponent(att.questionId)}`
                        );
                      }}
                      className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#18181B] transition-colors cursor-pointer first:rounded-t-2xl last:rounded-b-2xl"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <span className="w-6 font-mono text-xs text-[#71717A]">
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="truncate text-sm font-medium text-[#F5F5F5]">
                              {meta?.skillLabel ||
                                att.skill ||
                                `Question ${att.questionId}`}
                            </span>
                            {diffCode && (
                              <span
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${diff.className}`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${diff.dotColor}`}
                                />
                                <span>{diff.label}</span>
                              </span>
                            )}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-[#71717A]">
                            {meta?.domainLabel || att.domain} •{' '}
                            <span className="font-mono">{att.questionId}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right text-xs">
                        {att.isCorrect ? (
                          <span className="text-emerald-400">
                            Correct ({att.selectedAnswer})
                          </span>
                        ) : (
                          <span className="text-red-400">
                            Incorrect ({att.selectedAnswer}
                            {correctLabel ? ` → ${correctLabel}` : ''})
                          </span>
                        )}
                        <div className="mt-0.5 tabular-nums text-[#71717A]">
                          {formatShortDuration(att.timeSpent || 0)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: ACCOUNT SETTINGS
         ==================================================================== */}
      {activeTab === 'settings' && (
        <div className="mt-8 max-w-xl space-y-6">
          {/* Profile Details */}
          <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-6">
            <h2 className="text-sm font-semibold text-[#F5F5F5]">
              Profile Information
            </h2>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              Update your display name and email address.
            </p>

            {profileFeedback && (
              <div
                className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs ${
                  profileFeedback.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                {profileFeedback.text}
              </div>
            )}

            <form onSubmit={handleProfileSave} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] focus:border-[#69ff00] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] focus:border-[#69ff00] focus:outline-none"
                />
              </div>

              <div className="pt-1">
                <Button3D
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSavingProfile}
                >
                  {isSavingProfile ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Save Changes</span>
                </Button3D>
              </div>
            </form>
          </div>

          {/* Change Password */}
          <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-6">
            <h2 className="text-sm font-semibold text-[#F5F5F5]">
              Change Password
            </h2>
            <p className="mt-1 text-xs text-[#A1A1AA]">
              Choose a strong password of at least 6 characters.
            </p>

            {passwordFeedback && (
              <div
                className={`mt-4 rounded-xl border px-3.5 py-2.5 text-xs ${
                  passwordFeedback.type === 'success'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-rose-500/30 bg-rose-500/10 text-rose-200'
                }`}
              >
                {passwordFeedback.text}
              </div>
            )}

            <form onSubmit={handlePasswordSave} className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] focus:border-[#69ff00] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#A1A1AA]">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-xl border border-[#29292E] bg-[#0A0A0B] px-3.5 py-2.5 text-sm text-[#F5F5F5] focus:border-[#69ff00] focus:outline-none"
                />
              </div>

              <div className="pt-1">
                <Button3D
                  type="submit"
                  variant="secondary"
                  size="md"
                  disabled={isSavingPassword}
                >
                  {isSavingPassword ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <span>Update Password</span>
                  )}
                </Button3D>
              </div>
            </form>
          </div>

          {/* Data & Account Management */}
          <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-[#F5F5F5]">
                Data & Account
              </h2>
              <p className="mt-1 text-xs text-[#A1A1AA]">
                Reset your saved practice history or permanently delete your
                account.
              </p>
            </div>

            {/* Reset History */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1F1F23] pt-4">
              <div>
                <div className="text-xs font-medium text-[#F5F5F5]">
                  Reset Saved Practice History
                </div>
                <div className="text-xs text-[#71717A]">
                  Clears all {totalAttempts} saved question attempts and
                  sessions.
                </div>
              </div>

              {!confirmClearHistory ? (
                <button
                  type="button"
                  onClick={() => setConfirmClearHistory(true)}
                  className="rounded-xl border border-[#29292E] bg-[#18181B] px-3.5 py-2 text-xs font-medium text-[#D4D4D8] hover:border-[#3F3F46] hover:text-[#F5F5F5] transition-colors cursor-pointer"
                >
                  Reset History
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClearHistory(false)}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isClearingHistory}
                    onClick={handleConfirmClearHistory}
                    className="rounded-lg bg-rose-500/20 border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                  >
                    {isClearingHistory ? 'Clearing...' : 'Confirm Reset'}
                  </button>
                </div>
              )}
            </div>

            {/* Delete Account */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#1F1F23] pt-4">
              <div>
                <div className="text-xs font-medium text-[#F5F5F5]">
                  Delete Account
                </div>
                <div className="text-xs text-[#71717A]">
                  Permanently removes your account and all saved results.
                </div>
              </div>

              {!confirmDeleteAccount ? (
                <button
                  type="button"
                  onClick={() => setConfirmDeleteAccount(true)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#29292E] bg-[#18181B] px-3.5 py-2 text-xs font-medium text-rose-300 hover:border-rose-500/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Delete Account</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteAccount(false)}
                    className="rounded-lg px-2.5 py-1.5 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeletingAccount}
                    onClick={handleConfirmDeleteAccount}
                    className="rounded-lg bg-rose-500/20 border border-rose-500/40 px-3 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-500/30 cursor-pointer"
                  >
                    {isDeletingAccount ? 'Deleting...' : 'Confirm Delete'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
