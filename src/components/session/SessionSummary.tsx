'use client';

import React from 'react';
import { ArrowRight, Plus, RotateCcw } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button3D } from '@/components/ui/Button3D';
import { getQuestionFromMemory } from '@/services/questionBank';
import {
  formatDuration,
  formatShortDuration,
  getDifficultyBadgeInfo,
} from '@/utils/formatTime';
import { soundEngine } from '@/services/sound/soundEngine';

export const SessionSummary: React.FC = () => {
  const {
    activeSession,
    setIsSessionSummaryView,
    goToQuestionIndex,
    startPracticeSession,
    closeActiveSession,
    triggerWizardReset,
    metaMap,
    user,
    openAuthModal,
  } = useApp();

  if (!activeSession) return null;

  const states = activeSession.questionIds.map(
    (id) => activeSession.questionStates[id]
  );

  const correctCount = states.filter((s) => s?.isSubmitted && s.isCorrect).length;
  const incorrectCount = states.filter(
    (s) => s?.isSubmitted && !s.isCorrect
  ).length;
  const answeredCount = correctCount + incorrectCount;

  const accuracy =
    answeredCount > 0 ? Math.round((correctCount / answeredCount) * 100) : 0;

  const totalTimeMs = activeSession.totalTime;
  const answeredTimeMs = states
    .filter((s) => s?.isSubmitted)
    .reduce((acc, s) => acc + (s?.timeSpent || 0), 0);
  const avgTimeMs =
    answeredCount > 0 ? Math.round(answeredTimeMs / answeredCount) : 0;

  const mistakeQuestionIds = activeSession.questionIds.filter((id) => {
    const st = activeSession.questionStates[id];
    return st?.isSubmitted && !st.isCorrect;
  });

  const maxVisitedIdx = Math.max(
    activeSession.currentIndex,
    activeSession.maxVisitedIndex ?? 0
  );

  const displayedQuestionEntries = activeSession.questionIds
    .map((qId, idx) => ({
      qId,
      idx,
      st: activeSession.questionStates[qId],
    }))
    .filter(
      ({ idx, st }) =>
        idx <= maxVisitedIdx ||
        Boolean(st?.visited) ||
        Boolean(st?.isSubmitted) ||
        Boolean(st?.draftAnswer)
    );

  const handleReviewAll = () => {
    goToQuestionIndex(0);
    setIsSessionSummaryView(false);
  };

  const handleReviewMistakes = async () => {
    if (mistakeQuestionIds.length === 0) return;
    await startPracticeSession(
      {
        ...activeSession.filters,
        questionCount: mistakeQuestionIds.length,
      },
      'mistakes',
      `Mistakes Review — ${activeSession.title}`,
      mistakeQuestionIds
    );
  };

  const handleNewSession = () => {
    closeActiveSession();
    triggerWizardReset();
  };

  const encouragingLine =
    accuracy >= 85
      ? 'Exceptional work — your accuracy is right on target.'
      : accuracy >= 65
      ? "Nice work — you're making steady progress."
      : 'Every question reviewed builds stronger intuition for the next set.';

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 animate-completion">
      {/* Editorial Header */}
      <div className="border-b border-[#1F1F23] pb-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-[#A1A1AA]">
            Session completed •{' '}
            {activeSession.subject === 'rw' ? 'Reading & Writing' : 'Math'}
          </p>

          {user ? (
            <button
              type="button"
              onClick={() => openAuthModal('results')}
              className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              <span>Saved to {user.name}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('auth')}
              className="inline-flex items-center gap-1.5 text-xs text-[#A1A1AA] hover:text-[#69ff00] transition-colors cursor-pointer"
            >
              <span>Sign in to save results →</span>
            </button>
          )}
        </div>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="font-editorial text-2xl sm:text-3xl text-[#F5F5F5] tracking-tight">
              {activeSession.title}
            </h1>
            <p className="mt-2 text-sm text-[#A1A1AA]">{encouragingLine}</p>
          </div>

          <div className="sm:text-right">
            <div className="font-editorial text-3xl sm:text-4xl tabular-nums text-[#69ff00]">
              {accuracy}%
            </div>
            <div className="text-xs text-[#71717A] mt-0.5">Session Accuracy</div>
          </div>
        </div>

        {/* Clean Typography-Driven Metrics Strip */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-[#1F1F23] pt-6">
          <div>
            <div className="text-xs text-[#71717A]">Answered</div>
            <div className="mt-1 text-lg font-medium tabular-nums text-[#F5F5F5]">
              {answeredCount}
            </div>
          </div>

          <div>
            <div className="text-xs text-[#71717A]">Correct</div>
            <div className="mt-1 text-lg font-medium tabular-nums text-emerald-400">
              {correctCount}
            </div>
          </div>

          <div>
            <div className="text-xs text-[#71717A]">Incorrect</div>
            <div className="mt-1 text-lg font-medium tabular-nums text-red-400">
              {incorrectCount}
            </div>
          </div>

          <div>
            <div className="text-xs text-[#71717A]">Time (Avg)</div>
            <div className="mt-1 text-lg font-medium tabular-nums text-[#F5F5F5]">
              {formatDuration(totalTimeMs)}{' '}
              <span className="text-xs font-normal text-[#71717A]">
                ({formatShortDuration(avgTimeMs)}/q)
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button3D variant="primary" size="lg" onClick={handleReviewAll}>
            <span>Review Questions</span>
            <ArrowRight className="h-4 w-4" />
          </Button3D>

          {mistakeQuestionIds.length > 0 && (
            <Button3D
              variant="secondary"
              size="lg"
              onClick={handleReviewMistakes}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Retry Mistakes ({mistakeQuestionIds.length})</span>
            </Button3D>
          )}

          <Button3D variant="secondary" size="lg" onClick={handleNewSession}>
            <Plus className="h-4 w-4" />
            <span>New Practice Session</span>
          </Button3D>
        </div>
      </div>

      {/* Simple Divided Question List */}
      <div className="mt-10">
        <h2 className="text-xs font-medium text-[#71717A] mb-3">
          Question Breakdown — Click any item to inspect
        </h2>

        <div className="divide-y divide-[#1F1F23] rounded-2xl border border-[#29292E] bg-[#111113]">
          {displayedQuestionEntries.map(({ qId, idx, st }) => {
            const meta = metaMap.get(qId);
            const diff = getDifficultyBadgeInfo(meta?.difficulty);
            const cachedQ = getQuestionFromMemory(qId);
            const correctAnsList = st?.correctAnswer || cachedQ?.correctAnswer;
            const correctAnsLabel =
              correctAnsList && correctAnsList.length > 0
                ? correctAnsList.join(' or ')
                : null;

            return (
              <button
                key={qId}
                type="button"
                onClick={() => {
                  soundEngine.play('click');
                  goToQuestionIndex(idx);
                  setIsSessionSummaryView(false);
                }}
                className="group flex w-full items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#18181B] transition-colors cursor-pointer first:rounded-t-2xl last:rounded-b-2xl focus-visible:outline-2 focus-visible:outline-[#69ff00] focus-visible:outline-offset-[-2px]"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <span className="font-mono text-xs text-[#71717A] w-6">
                    {String(idx + 1).padStart(2, '0')}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm font-medium text-[#F5F5F5] group-hover:text-[#F5F5F5] truncate">
                        {meta?.skillLabel || `Question ${qId}`}
                      </span>
                      {meta?.difficulty && (
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
                    <div className="text-xs text-[#71717A] mt-0.5 truncate">
                      {meta?.domainLabel} • <span className="font-mono">{qId}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right text-xs">
                    {st?.isSubmitted ? (
                      st.isCorrect ? (
                        <span className="text-emerald-400">
                          Correct ({st.submittedAnswer})
                        </span>
                      ) : (
                        <span className="text-red-400">
                          Incorrect ({st.submittedAnswer}
                          {correctAnsLabel ? ` → ${correctAnsLabel}` : ''})
                        </span>
                      )
                    ) : (
                      <span className="text-[#71717A]">Unanswered</span>
                    )}
                    <div className="text-xs tabular-nums text-[#71717A]">
                      {formatShortDuration(st?.timeSpent || 0)}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
