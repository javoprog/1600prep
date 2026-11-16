'use client';

import React from 'react';
import {
  ArrowRight,
  Check,
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
import { formatDuration } from '@/utils/formatTime';
import { soundEngine } from '@/services/sound/soundEngine';

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
    <div className="w-full max-w-md rounded-2xl border border-[#29292E] bg-[#111113] p-7 sm:p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#29292E] bg-[#18181B] text-[#F5F5F5]">
        <Pause className="h-5 w-5" />
      </div>
      <h2 className="mt-4 font-editorial text-2xl text-[#F5F5F5]">
        Exam Paused
      </h2>
      <p className="mt-1.5 text-xs text-[#A1A1AA]">
        {moduleLabel} • Question hidden while timer is paused
      </p>

      <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#29292E] bg-[#0A0A0B] px-4 py-2 font-mono text-sm font-medium tabular-nums text-[#F5F5F5]">
        <Clock className="h-4 w-4 text-[#71717A]" />
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
          <span>Resume Exam</span>
        </Button3D>
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
    <div className="w-full max-w-lg rounded-2xl border border-[#29292E] bg-[#111113] p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[#69ff00]/30 bg-[#69ff00]/10 text-[#69ff00]">
        <Coffee className="h-5 w-5" />
      </div>
      <p className="mt-4 text-xs font-medium text-[#A1A1AA]">
        Section 1 Completed
      </p>
      <h2 className="mt-1 font-editorial text-2xl sm:text-3xl text-[#F5F5F5]">
        Take a Break
      </h2>
      <p className="mt-2 text-sm text-[#A1A1AA] leading-relaxed">
        You have completed Reading &amp; Writing. Take up to 10 minutes before
        starting Math Module 1, or begin whenever you are ready.
      </p>

      <div className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-[#29292E] bg-[#0A0A0B] px-5 py-2.5 font-mono text-xl font-medium tabular-nums text-[#F5F5F5]">
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
);

interface ExamModuleReviewScreenProps {
  activeModule: ExamModuleState;
  questionStates: Record<string, SessionQuestionState>;
  flaggedQuestionIds: string[];
  isFinalModule: boolean;
  isTransitioning: boolean;
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
  onJumpToQuestion,
  onBackToLastQuestion,
  onSubmitModule,
}) => {
  const flaggedSet = new Set(flaggedQuestionIds);
  const answeredCount = activeModule.questionIds.filter((id) =>
    Boolean(questionStates[id]?.draftAnswer.trim())
  ).length;
  const unansweredCount = activeModule.questionIds.length - answeredCount;
  const flaggedInModCount = activeModule.questionIds.filter((id) =>
    flaggedSet.has(id)
  ).length;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 animate-content-in">
      <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#1F1F23] pb-5">
          <div>
            <p className="text-xs font-medium text-[#A1A1AA]">
              {activeModule.label}
            </p>
            <h2 className="mt-1 font-editorial text-2xl sm:text-3xl text-[#F5F5F5]">
              Check Your Work
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-[#29292E] bg-[#0A0A0B] px-3 py-1 text-[#A1A1AA]">
              <strong className="font-semibold text-[#F5F5F5] tabular-nums">
                {answeredCount}
              </strong>{' '}
              answered
            </span>
            {unansweredCount > 0 && (
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-amber-300 tabular-nums">
                {unansweredCount} unanswered
              </span>
            )}
            {flaggedInModCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#3F3F46] bg-[#18181B] px-3 py-1 text-[#F5F5F5] tabular-nums">
                <Flag className="h-3 w-3 fill-amber-400 text-amber-400" />
                {flaggedInModCount} flagged
              </span>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs text-[#A1A1AA] leading-relaxed">
          Select any question number below to review or edit your answer. Once
          you submit this module, you cannot return to change answers.
        </p>

        {/* Question Status Tile Grid */}
        <div className="mt-6 grid grid-cols-6 sm:grid-cols-9 gap-2.5">
          {activeModule.questionIds.map((qId, idx) => {
            const isAnswered = Boolean(questionStates[qId]?.draftAnswer.trim());
            const isFlagged = flaggedSet.has(qId);

            return (
              <button
                key={qId}
                type="button"
                onClick={() => {
                  soundEngine.play('click');
                  onJumpToQuestion(idx);
                }}
                className={`relative flex h-11 items-center justify-center rounded-xl border font-mono text-sm font-medium transition-all cursor-pointer ${
                  isAnswered
                    ? 'border-[#69ff00]/55 bg-[#18181B] text-[#F5F5F5] hover:border-[#69ff00]'
                    : 'border-dashed border-[#3F3F46] bg-[#0A0A0B] text-[#71717A] hover:border-[#52525B] hover:text-[#F5F5F5]'
                }`}
                title={`Question ${idx + 1}${isAnswered ? ' (Answered)' : ' (Unanswered)'}${isFlagged ? ' • Flagged' : ''}`}
              >
                <span>{idx + 1}</span>
                {isFlagged && (
                  <Flag className="absolute top-1 right-1 h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-[#1F1F23] pt-6">
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

          <Button3D
            variant="primary"
            size="lg"
            disabled={isTransitioning}
            onClick={onSubmitModule}
            className="px-7"
          >
            {isTransitioning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Grading Module...</span>
              </>
            ) : (
              <>
                <span>
                  {isFinalModule ? 'Finish Exam & View Score' : 'Submit Module & Continue'}
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
  onSelectIndex: (idx: number) => void;
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
  onSelectIndex,
  onClose,
  moduleLabel,
}) => {
  if (!isOpen) return null;
  const flaggedSet = new Set(flaggedQuestionIds);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 animate-page-fade"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Question navigator"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[#3F3F46] bg-[#141417] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.8)] animate-content-in"
      >
        <div className="flex items-center justify-between border-b border-[#29292E] pb-3">
          <div className="flex items-center gap-2">
            <LayoutGrid className="h-4 w-4 text-[#71717A]" />
            <span className="text-sm font-semibold text-[#F5F5F5]">
              {moduleLabel || 'Questions'}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#27272A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            aria-label="Close question navigator"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 max-h-72 overflow-y-auto grid grid-cols-6 sm:grid-cols-7 gap-2 pr-1">
          {questionIds.map((qId, idx) => {
            const st = questionStates[qId];
            const isCurrent = idx === currentIndex;
            const isFlagged = flaggedSet.has(qId);
            const isAnswered = Boolean(st?.draftAnswer.trim() || st?.submittedAnswer);

            let tileStyle =
              'border-dashed border-[#3F3F46] bg-[#0A0A0B] text-[#71717A] hover:border-[#52525B] hover:text-[#F5F5F5]';
            if (isReviewMode && st?.isSubmitted) {
              tileStyle = st.isCorrect
                ? 'border-emerald-500/45 bg-emerald-500/10 text-emerald-300'
                : 'border-red-500/45 bg-red-500/10 text-red-300';
            } else if (isAnswered) {
              tileStyle = 'border-[#29292E] bg-[#18181B] text-[#F5F5F5] hover:border-[#3F3F46]';
            }

            return (
              <button
                key={qId}
                type="button"
                onClick={() => {
                  soundEngine.play('click');
                  onSelectIndex(idx);
                  onClose();
                }}
                className={`relative flex h-10 items-center justify-center rounded-xl border font-mono text-xs font-medium transition-all cursor-pointer ${tileStyle} ${
                  isCurrent ? 'ring-2 ring-[#69ff00] ring-offset-2 ring-offset-[#141417]' : ''
                }`}
              >
                <span>{idx + 1}</span>
                {isFlagged && (
                  <Flag className="absolute top-1 right-1 h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[#29292E] pt-3 text-xs text-[#71717A]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#18181B] border border-[#29292E]" />
            <span>Answered</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#0A0A0B] border border-dashed border-[#3F3F46]" />
            <span>Unanswered</span>
          </span>
          {!isReviewMode && (
            <span className="inline-flex items-center gap-1.5">
              <Flag className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span>Flagged</span>
            </span>
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
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 backdrop-blur-xs p-4 animate-page-fade"
      onClick={onContinue}
    >
      <div
        role="dialog"
        aria-label="Leave full exam"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-[#3F3F46] bg-[#141417] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)] animate-content-in"
      >
        <h3 className="font-editorial text-2xl text-[#F5F5F5]">
          Leave Full Practice?
        </h3>
        <p className="mt-2 text-xs text-[#A1A1AA] leading-relaxed">
          You can save your current module, answers, and remaining timer to
          resume later from the home screen, or discard this exam run.
        </p>

        <div className="mt-6 flex flex-col gap-2.5">
          <Button3D
            variant="primary"
            size="md"
            onClick={() => {
              soundEngine.play('select');
              onSaveAndExit();
            }}
            className="w-full"
          >
            <Check className="h-4 w-4" />
            <span>Save Progress &amp; Exit</span>
          </Button3D>

          <div className="grid grid-cols-2 gap-2.5">
            <Button3D
              variant="secondary"
              size="md"
              onClick={() => {
                soundEngine.play('click');
                onDiscard();
              }}
            >
              <span>Discard Exam</span>
            </Button3D>
            <Button3D
              variant="ghost"
              size="md"
              onClick={() => {
                soundEngine.play('click');
                onContinue();
              }}
            >
              <span>Keep Testing</span>
            </Button3D>
          </div>
        </div>
      </div>
    </div>
  );
};
