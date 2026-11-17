'use client';

import React, { useEffect } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Clock,
  Coffee,
  Flag,
  LayoutGrid,
  Loader2,
  Pause,
  Play,
  X,
} from 'lucide-react';
import { ExamModuleState, SessionQuestionState } from '@/types';
import { Button3D } from '@/components/ui/Button3D';
import { isIncompleteSprDraft } from '@/services/questionBank/normalizer';
import { formatDuration } from '@/utils/formatTime';
import { soundEngine } from '@/services/sound/soundEngine';

interface QuestionTileButtonProps {
  questionId: string;
  index: number;
  state?: SessionQuestionState;
  isCurrent?: boolean;
  isFlagged?: boolean;
  isReviewMode?: boolean;
  disabled?: boolean;
  onSelect: (index: number) => void;
}

const QuestionTileButton: React.FC<QuestionTileButtonProps> = ({
  questionId,
  index,
  state,
  isCurrent = false,
  isFlagged = false,
  isReviewMode = false,
  disabled = false,
  onSelect,
}) => {
  const rawDraftOrSub = state?.draftAnswer.trim() || state?.submittedAnswer || '';
  const isIncomplete = !isReviewMode && isIncompleteSprDraft(rawDraftOrSub);
  const isAnswered = Boolean(rawDraftOrSub) && !isIncomplete;

  let tileClass =
    'border-[#29292E] bg-[#0A0A0B] text-[#71717A] hover:border-[#3F3F46] hover:text-[#F5F5F5]';

  if (isReviewMode && state?.isSubmitted) {
    tileClass = state.isCorrect
      ? 'border-emerald-500/45 bg-emerald-500/12 text-emerald-300 hover:border-emerald-400'
      : 'border-red-500/45 bg-red-500/12 text-red-300 hover:border-red-400';
  } else if (isIncomplete) {
    tileClass =
      'border-amber-500/50 bg-amber-500/10 text-amber-300 hover:border-amber-400';
  } else if (isAnswered) {
    tileClass =
      'border-[#52525B] bg-[#27272A] text-[#F5F5F5] hover:border-[#71717A]';
  }

  if (isCurrent) {
    tileClass = isReviewMode
      ? `${tileClass} border-2 !border-[#69ff00] font-semibold`
      : `border-2 !border-[#69ff00] ${
          isAnswered ? 'bg-[#27272A]' : 'bg-[#18181B]'
        } text-[#F5F5F5] font-semibold`;
  }

  return (
    <button
      key={questionId}
      type="button"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        soundEngine.play('click');
        onSelect(index);
      }}
      title={`Question ${index + 1}${
        isIncomplete
          ? ' (Incomplete entry)'
          : isAnswered
          ? ' (Answered)'
          : ' (Unanswered)'
      }${isFlagged ? ' • Flagged' : ''}`}
      className={`relative flex h-9 w-9 items-center justify-center rounded-full border font-mono text-xs tabular-nums transition-colors ${
        disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
      } ${tileClass}`}
    >
      <span>{index + 1}</span>
      {isFlagged && (
        <span
          className="pointer-events-none absolute -top-1.5 -right-1.5 flex items-center justify-center"
          aria-label="Flagged"
        >
          <Flag className="h-3 w-3 fill-amber-400 text-amber-400" />
        </span>
      )}
    </button>
  );
};

interface ExamPauseScreenProps {
  moduleLabel: string;
  timeRemainingMs: number;
  onResume: () => void;
}

export const ExamPauseScreen: React.FC<ExamPauseScreenProps> = ({
  moduleLabel,
  timeRemainingMs,
  onResume,
}) => (
  <div className="flex flex-1 items-center justify-center px-4 py-16 animate-page-fade">
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#3F3F46] bg-[#111113] shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
      <div className="flex items-center justify-between border-b border-[#29292E] bg-[#18181B] px-5 py-3">
        <span className="text-xs font-semibold text-[#F5F5F5]">
          {moduleLabel}
        </span>
        <span className="rounded-full border border-[#29292E] bg-[#111113] px-2.5 py-0.5 text-xs font-medium text-[#A1A1AA]">
          Paused
        </span>
      </div>

      <div className="p-7 sm:p-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#29292E] bg-[#18181B] text-[#F5F5F5]">
          <Pause className="h-4.5 w-4.5" />
        </div>
        <h2 className="mt-4 font-editorial text-2xl text-[#F5F5F5]">
          Practice Paused
        </h2>
        <p className="mt-1.5 text-xs text-[#A1A1AA]">
          Questions are hidden while the countdown timer is paused.
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#29292E] bg-[#0A0A0B] px-4 py-2 font-mono text-sm font-medium tabular-nums text-[#F5F5F5]">
          <Clock className="h-3.5 w-3.5 text-[#71717A]" />
          <span>{formatDuration(timeRemainingMs)} remaining</span>
        </div>

        <div className="mt-7 flex justify-center">
          <Button3D
            variant="primary"
            size="lg"
            onClick={() => {
              soundEngine.play('select');
              onResume();
            }}
            className="px-7"
          >
            <Play className="h-4 w-4" />
            <span>Resume Practice</span>
          </Button3D>
        </div>
      </div>
    </div>
  </div>
);

interface ExamBreakScreenProps {
  breakTimeRemainingMs: number;
  onStartMathSection: () => void;
}

export const ExamBreakScreen: React.FC<ExamBreakScreenProps> = ({
  breakTimeRemainingMs,
  onStartMathSection,
}) => (
  <div className="flex flex-1 items-center justify-center px-4 py-16 animate-page-fade">
    <div className="w-full max-w-md overflow-hidden rounded-2xl border border-[#3F3F46] bg-[#111113] shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
      <div className="flex items-center justify-between border-b border-[#29292E] bg-[#18181B] px-5 py-3">
        <span className="text-xs font-semibold text-[#F5F5F5]">
          Section Intermission
        </span>
        <span className="rounded-full border border-[#29292E] bg-[#111113] px-2.5 py-0.5 text-xs font-medium text-[#A1A1AA]">
          Section 1 Complete
        </span>
      </div>

      <div className="p-7 sm:p-8 text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[#69ff00]/35 bg-[#69ff00]/10 text-[#69ff00]">
          <Coffee className="h-4.5 w-4.5" />
        </div>
        <h2 className="mt-4 font-editorial text-2xl sm:text-3xl text-[#F5F5F5]">
          Take a Break
        </h2>
        <p className="mt-2 text-xs text-[#A1A1AA] leading-relaxed">
          You have finished Reading &amp; Writing. Take up to 10 minutes before
          Math Module 1 begins, or continue whenever ready.
        </p>

        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#29292E] bg-[#0A0A0B] px-5 py-2 font-mono text-lg font-medium tabular-nums text-[#F5F5F5]">
          <Clock className="h-4 w-4 text-[#69ff00]" />
          <span>{formatDuration(breakTimeRemainingMs)}</span>
        </div>

        <div className="mt-7 flex justify-center">
          <Button3D
            variant="primary"
            size="lg"
            onClick={() => {
              soundEngine.play('select');
              onStartMathSection();
            }}
            className="px-7"
          >
            <span>Start Math Section</span>
            <ArrowRight className="h-4 w-4" />
          </Button3D>
        </div>
      </div>
    </div>
  </div>
);

interface ExamModuleReviewScreenProps {
  activeModule: ExamModuleState;
  questionStates: Record<string, SessionQuestionState>;
  flaggedQuestionIds: string[];
  isFinalModule: boolean;
  isTransitioning: boolean;
  isTimeExpired?: boolean;
  transitionError?: string | null;
  onJumpToQuestion: (index: number) => void;
  onBackToLastQuestion: () => void;
  onSubmitModule: () => void;
}

export const ExamModuleReviewScreen: React.FC<ExamModuleReviewScreenProps> = ({
  activeModule,
  questionStates,
  flaggedQuestionIds,
  isFinalModule,
  isTransitioning,
  isTimeExpired = false,
  transitionError = null,
  onJumpToQuestion,
  onBackToLastQuestion,
  onSubmitModule,
}) => {
  const flaggedSet = new Set(flaggedQuestionIds);
  const incompleteCount = activeModule.questionIds.filter((id) =>
    isIncompleteSprDraft(questionStates[id]?.draftAnswer)
  ).length;
  const answeredCount = activeModule.questionIds.filter((id) => {
    const draft = questionStates[id]?.draftAnswer.trim();
    return Boolean(draft) && !isIncompleteSprDraft(draft);
  }).length;
  const unansweredCount =
    activeModule.questionIds.length - answeredCount - incompleteCount;
  const flaggedInModCount = activeModule.questionIds.filter((id) =>
    flaggedSet.has(id)
  ).length;

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 animate-content-in">
      <div className="overflow-hidden rounded-2xl border border-[#3F3F46] bg-[#111113] shadow-[0_24px_60px_rgba(0,0,0,0.65)]">
        {/* Consistent Window Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#29292E] bg-[#18181B] px-5 py-3.5 sm:px-6">
          <span className="text-xs font-semibold text-[#F5F5F5]">
            {activeModule.label}
          </span>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[#29292E] bg-[#111113] px-2.5 py-0.5 text-[#A1A1AA] tabular-nums">
              <strong className="font-medium text-[#F5F5F5]">
                {answeredCount}
              </strong>{' '}
              answered
            </span>
            {incompleteCount > 0 && (
              <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-amber-300 tabular-nums">
                {incompleteCount} incomplete
              </span>
            )}
            {unansweredCount > 0 && (
              <span className="rounded-full border border-[#29292E] bg-[#111113] px-2.5 py-0.5 text-[#A1A1AA] tabular-nums">
                {unansweredCount} unanswered
              </span>
            )}
            {flaggedInModCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/35 bg-amber-500/10 px-2.5 py-0.5 text-amber-300 tabular-nums">
                <Flag className="h-3 w-3 fill-amber-400 text-amber-400" />
                {flaggedInModCount} flagged
              </span>
            )}
          </div>
        </div>

        {/* Review Body */}
        <div className="p-6 sm:p-7">
          <h2 className="font-editorial text-2xl text-[#F5F5F5]">
            {isTimeExpired ? 'Module Time Expired' : 'Check Your Work'}
          </h2>
          <p className="mt-1.5 text-xs text-[#A1A1AA] leading-relaxed">
            {isTimeExpired
              ? 'Time has ended for this module. Submit to grade your answers and continue.'
              : 'Click any question number below to review or edit your answer before locking this module.'}
          </p>

          <div className="mt-6 grid grid-cols-6 sm:grid-cols-9 justify-items-center gap-3">
            {activeModule.questionIds.map((qId, idx) => (
              <QuestionTileButton
                key={qId}
                questionId={qId}
                index={idx}
                state={questionStates[qId]}
                isFlagged={flaggedSet.has(qId)}
                disabled={isTimeExpired}
                onSelect={onJumpToQuestion}
              />
            ))}
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-[#71717A]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-[#52525B] bg-[#27272A]" />
              <span>Answered</span>
            </span>
            {incompleteCount > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full border border-amber-500/50 bg-amber-500/10" />
                <span>Incomplete</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border border-[#29292E] bg-[#0A0A0B]" />
              <span>Unanswered</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Flag className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>Flagged</span>
            </span>
          </div>

          {!isTimeExpired && incompleteCount > 0 && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-300 shrink-0 mt-0.5" />
              <span>
                {incompleteCount} numeric entry{incompleteCount > 1 ? ' items appear' : ' appears'} incomplete (for example, a trailing slash or minus sign) and will not receive credit unless finished.
              </span>
            </div>
          )}

          {transitionError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-[#4C2024] bg-[#201214] px-4 py-3 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{transitionError}</span>
            </div>
          )}
        </div>

        {/* Consistent Action Footer Band */}
        <div
          className={`flex flex-col-reverse sm:flex-row sm:items-center gap-3 border-t border-[#1F1F23] bg-[#141417] px-5 py-4 sm:px-6 ${
            isTimeExpired ? 'justify-end' : 'justify-between'
          }`}
        >
          {!isTimeExpired && (
            <Button3D
              variant="secondary"
              size="md"
              disabled={isTransitioning}
              onClick={() => {
                soundEngine.play('click');
                onBackToLastQuestion();
              }}
            >
              <span>Return to Module</span>
            </Button3D>
          )}

          <Button3D
            variant="primary"
            size="md"
            disabled={isTransitioning}
            onClick={onSubmitModule}
            className="px-6"
          >
            {isTransitioning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Grading Module...</span>
              </>
            ) : (
              <>
                <span>
                  {transitionError
                    ? 'Retry Submit & Continue'
                    : isFinalModule
                    ? 'Finish & View Score'
                    : 'Submit Module & Continue'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button3D>
        </div>
      </div>
    </div>
  );
};

interface ExamQuestionGridPopoverProps {
  isOpen: boolean;
  questionIds: string[];
  currentIndex: number;
  questionStates: Record<string, SessionQuestionState>;
  flaggedQuestionIds: string[];
  isReviewMode?: boolean;
  modules?: ExamModuleState[];
  onSelectIndex: (idx: number) => void;
  onGoToCheckWork?: () => void;
  onClose: () => void;
  moduleLabel?: string;
}

export const ExamQuestionGridPopover: React.FC<ExamQuestionGridPopoverProps> = ({
  isOpen,
  questionIds,
  currentIndex,
  questionStates,
  flaggedQuestionIds,
  isReviewMode = false,
  modules,
  onSelectIndex,
  onGoToCheckWork,
  onClose,
  moduleLabel,
}) => {
  if (!isOpen) return null;
  const flaggedSet = new Set(flaggedQuestionIds);

  const indexById = new Map<string, number>();
  questionIds.forEach((id, idx) => indexById.set(id, idx));

  const answeredCount = questionIds.filter((qId) => {
    const val =
      questionStates[qId]?.draftAnswer.trim() ||
      questionStates[qId]?.submittedAnswer ||
      '';
    return Boolean(val) && (isReviewMode || !isIncompleteSprDraft(val));
  }).length;
  const flaggedCount = questionIds.filter((qId) => flaggedSet.has(qId)).length;

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-3 pb-[74px] sm:pb-[80px] animate-page-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Question navigator"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[376px] overflow-hidden rounded-2xl border border-[#3F3F46] bg-[#111113] shadow-[0_24px_60px_rgba(0,0,0,0.85)] animate-content-in"
      >
        {/* Window Header Band */}
        <div className="flex items-center justify-between gap-2 border-b border-[#29292E] bg-[#18181B] px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-[#71717A]" />
            <span className="text-xs font-semibold text-[#F5F5F5] truncate">
              {moduleLabel || 'Questions'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              onClose();
            }}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            title="Close question navigator"
            aria-label="Close question navigator"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Status Summary Subbar */}
        <div className="flex items-center justify-between border-b border-[#1F1F23] bg-[#141417]/60 px-4 py-2 text-xs text-[#71717A] tabular-nums">
          <span>
            <strong className="font-medium text-[#F5F5F5]">{answeredCount}</strong> of{' '}
            {questionIds.length} answered
          </span>
          {!isReviewMode && flaggedCount > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-300">
              <Flag className="h-3 w-3 fill-amber-400 text-amber-400" />
              {flaggedCount} flagged
            </span>
          )}
        </div>

        {/* Question Circles Grid (Grouped by module when in full review mode) */}
        <div className="max-h-72 overflow-y-auto px-4 py-4">
          {isReviewMode && modules && modules.length > 1 ? (
            <div className="space-y-4">
              {modules.map((mod) => (
                <div key={mod.id}>
                  <div className="mb-2 text-xs font-medium text-[#71717A]">
                    {mod.label}
                  </div>
                  <div className="grid grid-cols-7 justify-items-center gap-x-2 gap-y-2.5">
                    {mod.questionIds.map((qId) => {
                      const globalIdx = indexById.get(qId) ?? 0;
                      return (
                        <QuestionTileButton
                          key={qId}
                          questionId={qId}
                          index={globalIdx}
                          state={questionStates[qId]}
                          isCurrent={globalIdx === currentIndex}
                          isFlagged={false}
                          isReviewMode
                          onSelect={(idx) => {
                            onSelectIndex(idx);
                            onClose();
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 justify-items-center gap-x-2 gap-y-2.5">
              {questionIds.map((qId, idx) => (
                <QuestionTileButton
                  key={qId}
                  questionId={qId}
                  index={idx}
                  state={questionStates[qId]}
                  isCurrent={idx === currentIndex}
                  isFlagged={!isReviewMode && flaggedSet.has(qId)}
                  isReviewMode={isReviewMode}
                  onSelect={(targetIdx) => {
                    onSelectIndex(targetIdx);
                    onClose();
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Window Footer Band: Matching Circular Legend + Quick Action */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F1F23] bg-[#141417] px-4 py-2.5 text-xs text-[#71717A]">
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-2 border-[#69ff00] bg-[#18181B]" />
              <span>Current</span>
            </span>
            {isReviewMode ? (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-emerald-500/45 bg-emerald-500/15" />
                  <span>Correct</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-red-500/45 bg-red-500/15" />
                  <span>Missed</span>
                </span>
              </>
            ) : (
              <>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-[#52525B] bg-[#27272A]" />
                  <span>Answered</span>
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full border border-[#29292E] bg-[#0A0A0B]" />
                  <span>Open</span>
                </span>
              </>
            )}
          </div>

          {onGoToCheckWork && (
            <button
              type="button"
              onClick={() => {
                soundEngine.play('click');
                onGoToCheckWork();
              }}
              className="text-xs font-medium text-[#F5F5F5] hover:text-[#69ff00] transition-colors cursor-pointer"
            >
              {isReviewMode ? 'Score Report →' : 'Check Work →'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface ExamExitModalProps {
  isOpen: boolean;
  onContinue: () => void;
  onSaveAndExit: () => void;
  onDiscard: () => void;
}

export const ExamExitModal: React.FC<ExamExitModalProps> = ({
  isOpen,
  onContinue,
  onSaveAndExit,
  onDiscard,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        soundEngine.play('toggleClose');
        onContinue();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onContinue]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 animate-page-fade"
      onClick={onContinue}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Leave full practice"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-2xl border border-[#3F3F46] bg-[#111113] shadow-[0_24px_60px_rgba(0,0,0,0.85)] animate-content-in"
      >
        {/* Window Header Bar */}
        <div className="flex items-center justify-between border-b border-[#29292E] bg-[#18181B] px-5 py-3">
          <span className="text-xs font-semibold text-[#F5F5F5]">
            Leave Full Practice?
          </span>
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              onContinue();
            }}
            aria-label="Close modal"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5">
          <p className="text-sm text-[#D4D4D8] leading-relaxed">
            Your answers, flags, and remaining module timer are saved locally on
            this device so you can resume anytime.
          </p>
        </div>

        {/* Balanced Action Footer Band */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[#1F1F23] bg-[#141417] px-5 py-3.5">
          <Button3D
            variant="danger"
            size="sm"
            onClick={() => {
              soundEngine.play('click');
              onDiscard();
            }}
          >
            <span>Discard</span>
          </Button3D>

          <div className="flex items-center gap-2.5">
            <Button3D
              variant="secondary"
              size="sm"
              onClick={() => {
                soundEngine.play('click');
                onContinue();
              }}
            >
              <span>Keep Practicing</span>
            </Button3D>
            <Button3D
              variant="primary"
              size="sm"
              onClick={() => {
                soundEngine.play('select');
                onSaveAndExit();
              }}
            >
              <span>Save &amp; Exit</span>
            </Button3D>
          </div>
        </div>
      </div>
    </div>
  );
};
