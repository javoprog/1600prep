'use client';

import React, { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button3D } from '@/components/ui/Button3D';
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
    metaMap,
  } = useApp();

  const [moduleFilterId, setModuleFilterId] = useState<string>('all');

  const isExamSummary =
    activeSession?.mode === 'exam' && Boolean(activeSession?.exam?.scoreReport);
  const examReport = activeSession?.exam?.scoreReport;
  const examModules = useMemo(
    () => activeSession?.exam?.modules || [],
    [activeSession?.exam?.modules]
  );

  if (!activeSession) return null;

  const totalQuestions = activeSession.questionIds.length;
  const states = activeSession.questionIds.map(
    (id) => activeSession.questionStates[id]
  );

  const correctCount = states.filter((s) => s?.isSubmitted && s.isCorrect).length;
  const incorrectCount = states.filter(
    (s) =>
      s?.isSubmitted &&
      !s.isCorrect &&
      (!isExamSummary || Boolean(s.submittedAnswer?.trim()))
  ).length;
  const answeredCount = isExamSummary
    ? states.filter((s) => Boolean(s?.submittedAnswer?.trim())).length
    : correctCount + incorrectCount;

  const accuracy =
    isExamSummary && totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : answeredCount > 0
      ? Math.round((correctCount / answeredCount) * 100)
      : 0;

  const totalTimeMs = activeSession.totalTime;
  const avgTimeMs =
    (isExamSummary ? totalQuestions : answeredCount) > 0
      ? Math.round(totalTimeMs / (isExamSummary ? totalQuestions : answeredCount))
      : 0;

  const mistakeQuestionIds = activeSession.questionIds.filter((id) => {
    const st = activeSession.questionStates[id];
    return st?.isSubmitted && !st.isCorrect;
  });

  const maxVisitedIdx = Math.max(
    activeSession.currentIndex,
    activeSession.maxVisitedIndex ?? 0
  );

  const moduleByQuestionId = new Map<string, string>();
  examModules.forEach((m) => {
    m.questionIds.forEach((qId) => moduleByQuestionId.set(qId, m.id));
  });

  const displayedQuestionEntries = activeSession.questionIds
    .map((qId, idx) => ({
      qId,
      idx,
      st: activeSession.questionStates[qId],
      modId: moduleByQuestionId.get(qId),
    }))
    .filter(({ idx, st, modId }) => {
      if (isExamSummary) {
        return moduleFilterId === 'all' || modId === moduleFilterId;
      }
      return (
        idx <= maxVisitedIdx ||
        Boolean(st?.visited) ||
        Boolean(st?.isSubmitted) ||
        Boolean(st?.draftAnswer)
      );
    });

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

  const encouragingLine =
    accuracy >= 85
      ? 'Exceptional work — your accuracy is right on target.'
      : accuracy >= 65
      ? "Nice work — you're making steady progress."
      : 'Every question reviewed builds stronger intuition for the next set.';

  const singleSectionPrediction =
    examReport?.sections.rw || examReport?.sections.math;

  const heroScore =
    examReport?.track === 'full'
      ? examReport.totalScore
      : singleSectionPrediction?.predictedScore;
  const heroRangeLow =
    examReport?.track === 'full'
      ? examReport.totalRangeLow
      : singleSectionPrediction?.rangeLow;
  const heroRangeHigh =
    examReport?.track === 'full'
      ? examReport.totalRangeHigh
      : singleSectionPrediction?.rangeHigh;

  const sectionPredictions = [
    examReport?.sections.rw,
    examReport?.sections.math,
  ].filter((s): s is NonNullable<typeof s> => Boolean(s));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 animate-completion">
      {/* Editorial Header */}
      <div className="border-b border-[#1F1F23] pb-8">
        <p className="text-xs font-medium text-white">
          {isExamSummary
            ? `Score Report • ${
                examReport?.track === 'full'
                  ? 'Full Digital SAT Practice'
                  : examReport?.track === 'rw'
                  ? 'Only Reading & Writing Full Practice'
                  : 'Only Math Full Practice'
              }`
            : `Session completed • ${
                activeSession.subject === 'rw' ? 'Reading & Writing' : 'Math'
              }`}
        </p>
        <div className="mt-2 flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <h1 className="font-editorial text-2xl sm:text-3xl text-[#F5F5F5] tracking-tight">
              {activeSession.title}
            </h1>
            <p className="mt-2 text-sm text-[#A1A1AA]">{encouragingLine}</p>
          </div>

          {isExamSummary && heroScore !== undefined ? (
            <div className="sm:text-right">
              <div className="font-editorial text-4xl sm:text-5xl tabular-nums text-[#69ff00] leading-none">
                {heroScore}
                <span className="ml-1.5 text-base font-sans font-normal text-[#71717A]">
                  / {examReport?.track === 'full' ? '1600' : '800'}
                </span>
              </div>
              <div className="text-xs text-[#A1A1AA] mt-1.5 tabular-nums">
                Estimated range {heroRangeLow}–{heroRangeHigh}
              </div>
            </div>
          ) : (
            <div className="sm:text-right">
              <div className="font-editorial text-3xl sm:text-4xl tabular-nums text-[#69ff00]">
                {accuracy}%
              </div>
              <div className="text-xs text-[#71717A] mt-0.5">Session Accuracy</div>
            </div>
          )}
        </div>

        {/* Section Score Cards + Adaptive Module 2 Reveal (Full Exam only) */}
        {isExamSummary && sectionPredictions.length > 0 && (
          <div
            className={`mt-8 grid gap-4 ${
              sectionPredictions.length === 2
                ? 'grid-cols-1 sm:grid-cols-2'
                : 'grid-cols-1'
            }`}
          >
            {sectionPredictions.map((sec) => (
              <div
                key={sec.subject}
                className="rounded-2xl border border-[#29292E] bg-[#111113] p-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-[#A1A1AA]">
                      {sec.subjectLabel}
                    </div>
                    <div className="mt-1 flex items-baseline gap-2">
                      <span className="font-editorial text-3xl tabular-nums text-[#F5F5F5]">
                        {sec.predictedScore}
                      </span>
                      <span className="text-xs tabular-nums text-[#71717A]">
                        ({sec.rangeLow}–{sec.rangeHigh})
                      </span>
                    </div>
                  </div>

                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                      sec.module2Tier === 'hard'
                        ? 'border-[#69ff00]/35 bg-[#69ff00]/10 text-[#69ff00]'
                        : 'border-[#29292E] bg-[#18181B] text-[#A1A1AA]'
                    }`}
                  >
                    {sec.module2Tier === 'hard'
                      ? 'Harder Module 2'
                      : 'Easier Module 2'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#1F1F23] pt-3 text-xs">
                  <div>
                    <span className="text-[#71717A]">Module 1</span>
                    <div className="mt-0.5 font-mono font-medium text-[#F5F5F5] tabular-nums">
                      {sec.module1Correct}/{sec.module1Total} correct
                    </div>
                  </div>
                  <div>
                    <span className="text-[#71717A]">Module 2</span>
                    <div className="mt-0.5 font-mono font-medium text-[#F5F5F5] tabular-nums">
                      {sec.module2Correct}/{sec.module2Total} correct
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Clean Typography-Driven Metrics Strip */}
        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-6 border-t border-[#1F1F23] pt-6">
          <div>
            <div className="text-xs text-[#71717A]">Answered</div>
            <div className="mt-1 text-lg font-medium tabular-nums text-[#F5F5F5]">
              {answeredCount}
              {isExamSummary && (
                <span className="text-xs font-normal text-[#71717A]">
                  /{totalQuestions}
                </span>
              )}
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
              <span>Retry Mistakes ({mistakeQuestionIds.length})</span>
            </Button3D>
          )}
        </div>
      </div>

      {/* Domain Breakdown Grid (Full Exam only) */}
      {isExamSummary && examReport && examReport.domainBreakdown.length > 0 && (
        <div className="mt-10 border-b border-[#1F1F23] pb-10">
          <h2 className="text-xs font-medium text-[#71717A] mb-4">
            Domain Performance
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {examReport.domainBreakdown.map((dom) => {
              const pct =
                dom.total > 0 ? Math.round((dom.correct / dom.total) * 100) : 0;
              return (
                <div
                  key={`${dom.subject}-${dom.domain}`}
                  className="rounded-2xl border border-[#29292E] bg-[#111113] p-4"
                >
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-[#F5F5F5] truncate">
                      {dom.domainLabel}
                    </span>
                    <span className="shrink-0 font-mono text-[#A1A1AA] tabular-nums">
                      {dom.correct}/{dom.total} ({pct}%)
                    </span>
                  </div>
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[#1F1F23]">
                    <div
                      className="h-full rounded-full bg-[#69ff00] transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Simple Divided Question List */}
      <div className="mt-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-medium text-[#71717A]">
            Question Breakdown — Click any item to inspect
          </h2>

          {isExamSummary && examModules.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  soundEngine.play('click');
                  setModuleFilterId('all');
                }}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                  moduleFilterId === 'all'
                    ? 'border-transparent bg-[#69ff00] text-[#0A0A0B] font-semibold'
                    : 'border-[#29292E] bg-[#111113] text-[#A1A1AA] hover:text-[#F5F5F5]'
                }`}
              >
                All ({totalQuestions})
              </button>
              {examModules.map((mod) => (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => {
                    soundEngine.play('click');
                    setModuleFilterId(mod.id);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                    moduleFilterId === mod.id
                      ? 'border-transparent bg-[#69ff00] text-[#0A0A0B] font-semibold'
                      : 'border-[#29292E] bg-[#111113] text-[#A1A1AA] hover:text-[#F5F5F5]'
                  }`}
                >
                  {mod.shortLabel}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="divide-y divide-[#1F1F23] rounded-2xl border border-[#29292E] bg-[#111113]">
          {displayedQuestionEntries.map(({ qId, idx, st }) => {
            const meta = metaMap.get(qId);
            const diff = getDifficultyBadgeInfo(meta?.difficulty);

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
                      <span className="text-sm font-medium text-[#F5F5F5] group-hover:text-white truncate">
                        {meta?.skillLabel || `Question ${qId}`}
                      </span>
                      {meta?.difficulty && (
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-xs ${diff.className}`}
                        >
                          {diff.label}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#71717A] mt-0.5">
                      {meta?.domainLabel} • <span className="font-mono">{qId}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right text-xs">
                    {st?.isSubmitted && st.submittedAnswer ? (
                      <span
                        className={
                          st.isCorrect ? 'text-emerald-400' : 'text-red-400'
                        }
                      >
                        {st.isCorrect ? 'Correct' : 'Incorrect'} ({st.submittedAnswer})
                      </span>
                    ) : st?.isSubmitted ? (
                      <span className="text-red-400">Skipped</span>
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
