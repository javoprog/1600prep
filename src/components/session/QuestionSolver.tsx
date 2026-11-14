'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Ban,
  BookOpen,
  Calculator,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Share2,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { fetchQuestionDetail } from '@/services/questionBank';
import { Question } from '@/types';
import { RichMathContent } from '@/components/question/RichMathContent';
import { Button3D } from '@/components/ui/Button3D';
import {
  MathCalculatorPanel,
  MathReferenceSheet,
  SprDirectionsWindow,
} from '@/components/session/MathTools';
import {
  formatDuration,
  formatShortDuration,
  getDifficultyBadgeInfo,
} from '@/utils/formatTime';
import { soundEngine } from '@/services/sound/soundEngine';

export const QuestionSolver: React.FC = () => {
  const {
    activeSession,
    setDraftAnswer,
    submitAnswer,
    goToQuestionIndex,
    completeSession,
    closeActiveSession,
    syncSessionTime,
    setIsSessionSummaryView,
    metaMap,
  } = useApp();

  const [question, setQuestion] = useState<Question | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState<boolean>(true);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [eliminatedMap, setEliminatedMap] = useState<Record<string, string[]>>({});
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [isReferenceOpen, setIsReferenceOpen] = useState<boolean>(false);
  const [isSprDirectionsOpen, setIsSprDirectionsOpen] = useState<boolean>(false);
  const [isTimerHidden, setIsTimerHidden] = useState<boolean>(false);
  const [isShareCopied, setIsShareCopied] = useState<boolean>(false);

  // Per-question stopwatch that resets to 0 on each question
  const [questionTimerMs, setQuestionTimerMs] = useState<number>(0);
  const lastTickRef = useRef<number>(Date.now());

  const currentQuestionId = useMemo(() => {
    if (!activeSession) return null;
    return activeSession.questionIds[activeSession.currentIndex] || null;
  }, [activeSession]);

  const currentQuestionState = useMemo(() => {
    if (!activeSession || !currentQuestionId) return null;
    return activeSession.questionStates[currentQuestionId] || null;
  }, [activeSession, currentQuestionId]);

  const isCompletedSession = Boolean(activeSession?.completedAt);

  // Load current question details
  const loadQuestion = useCallback(async (qId: string) => {
    setIsLoadingQuestion(true);
    setQuestionError(null);
    try {
      const q = await fetchQuestionDetail(qId);
      setQuestion(q);
    } catch (err) {
      setQuestionError(
        err instanceof Error
          ? err.message
          : 'Failed to load question content from the Question Bank.'
      );
    } finally {
      setIsLoadingQuestion(false);
    }
  }, []);

  // Reset per-question timer and share state whenever the question changes
  useEffect(() => {
    if (currentQuestionId) {
      setIsShareCopied(false);
      setQuestionTimerMs(0);
      lastTickRef.current = Date.now();
      loadQuestion(currentQuestionId);
    }
  }, [currentQuestionId, loadQuestion]);

  // Per-question Wall-Clock Stopwatch (resets after each question)
  useEffect(() => {
    if (
      !activeSession ||
      isCompletedSession ||
      isLoadingQuestion ||
      currentQuestionState?.isSubmitted
    ) {
      return;
    }

    lastTickRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickRef.current;
      if (delta > 0) {
        lastTickRef.current = now;
        setQuestionTimerMs((prev) => prev + delta);
        syncSessionTime(delta, currentQuestionId, delta);
      }
    }, 250);

    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        const delta = now - lastTickRef.current;
        if (delta > 0) {
          lastTickRef.current = now;
          setQuestionTimerMs((prev) => prev + delta);
          syncSessionTime(delta, currentQuestionId, delta);
        }
      } else {
        lastTickRef.current = now;
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    activeSession?.id,
    isCompletedSession,
    isLoadingQuestion,
    currentQuestionId,
    currentQuestionState?.isSubmitted,
    syncSessionTime,
  ]);

  const totalQuestions = activeSession?.questionIds.length || 0;
  const currentIdx = activeSession?.currentIndex || 0;

  const handleSelectMcq = useCallback(
    (label: string) => {
      if (!currentQuestionId || !currentQuestionState || currentQuestionState.isSubmitted) {
        return;
      }
      soundEngine.play('select');
      setDraftAnswer(currentQuestionId, label);
    },
    [currentQuestionId, currentQuestionState, setDraftAnswer]
  );

  const handleSubmit = useCallback(async () => {
    if (
      !question ||
      !currentQuestionState ||
      currentQuestionState.isSubmitted ||
      !currentQuestionState.draftAnswer.trim()
    ) {
      return;
    }
    await submitAnswer(question);
  }, [question, currentQuestionState, submitAnswer]);

  // Keyboard shortcuts for fast, ergonomic problem solving
  useEffect(() => {
    if (!activeSession || !currentQuestionId || !currentQuestionState) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      // Escape closes floating windows
      if (e.key === 'Escape') {
        if (isSprDirectionsOpen) {
          setIsSprDirectionsOpen(false);
          return;
        }
        if (isReferenceOpen) {
          setIsReferenceOpen(false);
          return;
        }
        if (isCalculatorOpen) {
          setIsCalculatorOpen(false);
          return;
        }
      }

      // Enter checks the answer if selected, or moves to next question if already submitted
      if (e.key === 'Enter') {
        if (target?.tagName === 'BUTTON' || target?.tagName === 'A') return;
        if (
          !currentQuestionState.isSubmitted &&
          currentQuestionState.draftAnswer.trim()
        ) {
          e.preventDefault();
          handleSubmit();
          return;
        }
        if (
          currentQuestionState.isSubmitted &&
          currentIdx < totalQuestions - 1
        ) {
          e.preventDefault();
          soundEngine.play('click');
          goToQuestionIndex(currentIdx + 1);
          return;
        }
      }

      // Left / Right arrows navigate between questions (unless editing non-empty text in an input)
      if (e.key === 'ArrowLeft') {
        if (
          isInputFocused &&
          !currentQuestionState.isSubmitted &&
          currentQuestionState.draftAnswer.length > 0
        ) {
          return;
        }
        if (currentIdx > 0) {
          e.preventDefault();
          soundEngine.play('click');
          goToQuestionIndex(currentIdx - 1);
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        if (
          isInputFocused &&
          !currentQuestionState.isSubmitted &&
          currentQuestionState.draftAnswer.length > 0
        ) {
          return;
        }
        if (currentIdx < totalQuestions - 1) {
          e.preventDefault();
          soundEngine.play('click');
          goToQuestionIndex(currentIdx + 1);
        }
        return;
      }

      // MCQ option shortcuts: A/B/C/D or 1/2/3/4 (and Shift + A/B/C/D to cross out)
      if (
        !isInputFocused &&
        question?.questionType === 'mcq' &&
        !currentQuestionState.isSubmitted
      ) {
        const keyMap: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          a: 'A',
          b: 'B',
          c: 'C',
          d: 'D',
          '1': 'A',
          '2': 'B',
          '3': 'C',
          '4': 'D',
        };
        const mapped = keyMap[e.key.toLowerCase()];
        if (mapped) {
          e.preventDefault();
          if (e.shiftKey) {
            soundEngine.play('click');
            setEliminatedMap((prev) => {
              const current = prev[currentQuestionId] || [];
              const next = current.includes(mapped)
                ? current.filter((l) => l !== mapped)
                : [...current, mapped];
              return { ...prev, [currentQuestionId]: next };
            });
          } else {
            handleSelectMcq(mapped);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeSession,
    currentQuestionId,
    currentQuestionState,
    currentIdx,
    totalQuestions,
    question?.questionType,
    isSprDirectionsOpen,
    isReferenceOpen,
    isCalculatorOpen,
    goToQuestionIndex,
    handleSelectMcq,
    handleSubmit,
  ]);

  if (!activeSession || !currentQuestionId || !currentQuestionState) {
    return null;
  }

  const currentMeta = question || metaMap.get(currentQuestionId);
  const isMathSubject =
    (currentMeta?.subject || activeSession.subject) === 'math';
  const sectionLabel =
    currentMeta?.subjectLabel ||
    (activeSession.subject === 'rw' ? 'Reading & Writing' : 'Math');
  const diffBadge = getDifficultyBadgeInfo(currentMeta?.difficulty);

  const eliminatedForCurrent = eliminatedMap[currentQuestionId] || [];

  const toggleEliminateOption = (label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    soundEngine.play('click');
    setEliminatedMap((prev) => {
      const current = prev[currentQuestionId] || [];
      const next = current.includes(label)
        ? current.filter((l) => l !== label)
        : [...current, label];
      return { ...prev, [currentQuestionId]: next };
    });
  };

  const handleSprChange = (val: string) => {
    if (currentQuestionState.isSubmitted) return;
    if (!/^-?[0-9./]*$/.test(val)) return;
    const maxLen = val.startsWith('-') ? 6 : 5;
    if (val.length > maxLen) return;
    const slashCount = (val.match(/\//g) || []).length;
    const dotCount = (val.match(/\./g) || []).length;
    if (slashCount > 1 || dotCount > 1) return;
    setDraftAnswer(currentQuestionId, val);
  };

  const handleShareQuestion = async () => {
    soundEngine.play('click');
    if (typeof window === 'undefined') return;
    const shareUrl = `${window.location.origin}/?question=${encodeURIComponent(
      currentQuestionId
    )}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setIsShareCopied(true);
      setTimeout(() => setIsShareCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = shareUrl;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setIsShareCopied(true);
        setTimeout(() => setIsShareCopied(false), 2000);
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  const hasPassage = Boolean(
    question?.passage && question.passage.trim().length > 0
  );
  // In Bluebook Digital SAT, only Reading & Writing uses the 2-column Passage/Question split;
  // Math is always a single column with any stimulus equation/table/graph directly above the stem.
  const useSplitPassageColumn = hasPassage && !isMathSubject;

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0B] text-[#F5F5F5]">
      {/* Dedicated Examination Top Header */}
      <header className="sticky top-0 z-30 h-16 w-full border-b border-[#1F1F23] bg-[#0A0A0B]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-full max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          {/* Left: 1600prep Brand Wordmark (serves as Exit button) */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => {
                soundEngine.play('click');
                closeActiveSession();
              }}
              className="group flex items-baseline cursor-pointer focus:outline-none"
              title="Return to main menu"
            >
              <span className="font-editorial text-2xl tracking-tight text-[#F5F5F5] transition-opacity group-hover:opacity-90">
                1600prep
              </span>
            </button>
          </div>

          {/* Center: Question Timer with Minimal Icon-Only Hide/Show Toggle */}
          <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            <span
              className="font-mono text-lg sm:text-xl font-medium tabular-nums tracking-tight text-[#F5F5F5]"
              title="Question elapsed time"
            >
              {isTimerHidden ? '—' : formatDuration(questionTimerMs)}
            </span>

            <button
              type="button"
              onClick={() => {
                soundEngine.play('click');
                setIsTimerHidden((prev) => !prev);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-[#71717A] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              title={isTimerHidden ? 'Show timer' : 'Hide timer'}
              aria-label={isTimerHidden ? 'Show timer' : 'Hide timer'}
            >
              {isTimerHidden ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* Right: Math Tools (Calculator & Reference) + Icon-Only Share Button */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {isMathSubject && (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    soundEngine.play('click');
                    setIsCalculatorOpen((prev) => !prev);
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors cursor-pointer ${
                    isCalculatorOpen
                      ? 'bg-[#18181B] text-[#F4F0EA]'
                      : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                  }`}
                  title="Graphing Calculator"
                  aria-label="Graphing Calculator"
                  aria-pressed={isCalculatorOpen}
                >
                  <Calculator className="h-4 w-4" />
                  <span className="hidden md:inline">Calculator</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    soundEngine.play('click');
                    setIsReferenceOpen((prev) => !prev);
                  }}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition-colors cursor-pointer ${
                    isReferenceOpen
                      ? 'bg-[#18181B] text-[#F4F0EA]'
                      : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                  }`}
                  title="Math Reference Sheet"
                  aria-label="Math Reference Sheet"
                  aria-pressed={isReferenceOpen}
                >
                  <BookOpen className="h-4 w-4" />
                  <span className="hidden md:inline">Reference</span>
                </button>
              </div>
            )}

            {/* Icon-only Share Question Link Button without background or text */}
            <button
              type="button"
              onClick={handleShareQuestion}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              title={isShareCopied ? 'Link copied!' : 'Copy link to this question'}
              aria-label="Copy link to this question"
            >
              {isShareCopied ? (
                <Check className="h-4 w-4 text-emerald-400" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Floating SAT Math Calculator, Reference Sheet & SPR Directions Windows */}
      {isMathSubject && (
        <>
          <MathCalculatorPanel
            isOpen={isCalculatorOpen}
            onClose={() => setIsCalculatorOpen(false)}
          />
          <MathReferenceSheet
            isOpen={isReferenceOpen}
            onClose={() => setIsReferenceOpen(false)}
          />
        </>
      )}
      <SprDirectionsWindow
        isOpen={isSprDirectionsOpen}
        onClose={() => setIsSprDirectionsOpen(false)}
      />

      {/* Dedicated Examination Workspace */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:py-10">
        {isLoadingQuestion ? (
          <div className="flex flex-1 flex-col items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[#F4F0EA]" />
            <p className="mt-3 text-xs text-[#71717A]">
              Loading question {currentIdx + 1}...
            </p>
          </div>
        ) : questionError || !question ? (
          <div className="mx-auto my-16 max-w-md rounded-2xl border border-[#4C2024] bg-[#111113] p-7 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-red-400" />
            <h3 className="mt-3 font-editorial text-2xl text-[#F5F5F5]">
              Unable to Load Question
            </h3>
            <p className="mt-1.5 text-xs text-[#A1A1AA]">
              {questionError || 'Question content is temporarily unavailable.'}
            </p>
            <div className="mt-5 flex justify-center">
              <Button3D
                variant="primary"
                size="sm"
                onClick={() => loadQuestion(currentQuestionId)}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Retry</span>
              </Button3D>
            </div>
          </div>
        ) : (
          <div
            className={`grid flex-1 gap-8 lg:gap-12 ${
              useSplitPassageColumn
                ? 'grid-cols-1 lg:grid-cols-12 items-start'
                : 'mx-auto w-full max-w-3xl grid-cols-1'
            }`}
          >
            {/* Left Examination Column: Reading & Writing Passage (when present) */}
            {useSplitPassageColumn && (
              <div className="lg:col-span-6 lg:border-r lg:border-[#1F1F23] lg:pr-10 lg:sticky lg:top-20 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
                <div className="mb-4 flex items-center text-xs text-[#71717A]">
                  <span>Passage</span>
                </div>
                <RichMathContent
                  html={question.passage}
                  variant="passage"
                />
              </div>
            )}

            {/* Right Examination Column (or Centered Column for Math): Question Stem, Choices, Feedback */}
            <div
              className={`${
                useSplitPassageColumn ? 'lg:col-span-6' : ''
              } space-y-8 min-w-0`}
            >
              {/* Static Single-Line Question Metadata Header (Section, Domain, Truncated Skill, Difficulty & ID) */}
              <div>
                <div className="mb-4 flex items-center justify-between gap-3 border-b border-[#1F1F23] pb-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1 text-xs">
                    <span className="flex h-6 min-w-[1.5rem] shrink-0 px-1.5 items-center justify-center rounded bg-[#F4F0EA] font-mono text-xs font-semibold text-[#0A0A0B]">
                      {currentIdx + 1}
                    </span>

                    <span className="font-medium text-[#F5F5F5] shrink-0">
                      {sectionLabel}
                    </span>

                    {currentMeta?.domainLabel && (
                      <>
                        <span className="text-[#3F3F46] shrink-0">•</span>
                        <span className="text-[#D4D4D8] shrink-0">
                          {currentMeta.domainLabel}
                        </span>
                      </>
                    )}

                    {currentMeta?.skillLabel && (
                      <>
                        <span className="text-[#3F3F46] shrink-0">•</span>
                        <span
                          className="text-[#A1A1AA] truncate min-w-0"
                          title={currentMeta.skillLabel}
                        >
                          {currentMeta.skillLabel}
                        </span>
                      </>
                    )}

                    {currentMeta?.difficulty && (
                      <span
                        className={`shrink-0 rounded border px-2 py-0.5 text-[11px] ${diffBadge.className}`}
                      >
                        {diffBadge.label}
                      </span>
                    )}
                  </div>

                  <span className="font-mono text-xs text-[#71717A] shrink-0">
                    ID {currentQuestionId}
                  </span>
                </div>

                {/* Math Stimulus (equation, table, system, or figure stored in question.passage) directly above stem */}
                {!useSplitPassageColumn && hasPassage && (
                  <div className="mb-4">
                    <RichMathContent
                      html={question.passage}
                      variant="stem"
                    />
                  </div>
                )}

                {/* Question Stem */}
                <RichMathContent
                  html={question.questionContent}
                  variant="stem"
                />
              </div>

              {/* Answer Options (MCQ) or Unified Student-Produced Response (SPR) Input */}
              {question.questionType === 'mcq' && question.answerOptions ? (
                <div className="space-y-3">
                  {question.answerOptions.map((opt) => {
                    const isSelected =
                      currentQuestionState.draftAnswer === opt.label;
                    const isSubmitted = currentQuestionState.isSubmitted;
                    const isCorrectOption = question.correctAnswer.includes(
                      opt.label
                    );
                    const isEliminated =
                      eliminatedForCurrent.includes(opt.label) && !isSubmitted;

                    let optionSurface =
                      'border-[#29292E] bg-[#111113] hover:border-[#3F3F46] hover:bg-[#18181B]/70';
                    let badgeStyle =
                      'border-[#3F3F46] bg-[#18181B] text-[#A1A1AA]';

                    if (isSubmitted) {
                      if (isCorrectOption) {
                        optionSurface =
                          'border-emerald-500/50 bg-[#101F18] text-[#F5F5F5]';
                        badgeStyle =
                          'border-emerald-400 bg-emerald-400 text-[#0A0A0B] font-semibold';
                      } else if (isSelected && !isCorrectOption) {
                        optionSurface =
                          'border-red-500/50 bg-[#221215] text-[#F5F5F5]';
                        badgeStyle =
                          'border-red-400 bg-red-400 text-[#0A0A0B] font-semibold';
                      } else {
                        optionSurface =
                          'border-[#1F1F23] bg-[#0A0A0B] opacity-55';
                      }
                    } else if (isEliminated) {
                      optionSurface =
                        'border-[#1F1F23] bg-[#0D0D0F] hover:border-[#29292E]';
                      badgeStyle =
                        'border-[#29292E] bg-[#141417] text-[#52525B]';
                    } else if (isSelected) {
                      optionSurface = 'border-[#F4F0EA] bg-[#18181B]';
                      badgeStyle =
                        'border-[#F4F0EA] bg-[#F4F0EA] text-[#0A0A0B] font-semibold';
                    }

                    return (
                      <div
                        key={opt.id}
                        role="button"
                        tabIndex={isSubmitted ? -1 : 0}
                        onClick={() => handleSelectMcq(opt.label)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectMcq(opt.label);
                          }
                        }}
                        className={`group relative flex items-center gap-4 rounded-xl border p-4 transition-all duration-150 ${optionSurface} ${
                          isSubmitted ? 'cursor-default' : 'cursor-pointer'
                        }`}
                      >
                        {/* Full-width visual cross-out line that strikes across text, KaTeX equations, SVGs, and image formulas alike */}
                        {isEliminated && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 right-12 top-1/2 -translate-y-1/2 h-[2px] rounded-full bg-[#A1A1AA]/85 z-10"
                          />
                        )}

                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-mono text-xs transition-all ${badgeStyle} ${
                            isEliminated ? 'opacity-35' : ''
                          }`}
                        >
                          {opt.label}
                        </div>

                        <div
                          className={`flex-1 transition-opacity ${
                            isEliminated
                              ? 'opacity-30 grayscale select-none'
                              : ''
                          }`}
                        >
                          <RichMathContent
                            html={opt.content}
                            variant="option"
                          />
                        </div>

                        {isSubmitted ? (
                          isCorrectOption ? (
                            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                          ) : isSelected ? (
                            <X className="h-4 w-4 shrink-0 text-red-400" />
                          ) : null
                        ) : (
                          <button
                            type="button"
                            onClick={(e) =>
                              toggleEliminateOption(opt.label, e)
                            }
                            title={
                              isEliminated
                                ? `Restore answer choice ${opt.label}`
                                : `Cross out answer choice ${opt.label}`
                            }
                            aria-label={
                              isEliminated
                                ? `Restore answer choice ${opt.label}`
                                : `Cross out answer choice ${opt.label}`
                            }
                            className={`relative z-20 flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors cursor-pointer ${
                              isEliminated
                                ? 'text-[#F4F0EA] hover:bg-[#1F1F23] hover:text-white'
                                : 'text-[#71717A] hover:bg-[#1F1F23] hover:text-[#F5F5F5]'
                            }`}
                          >
                            {isEliminated ? (
                              <Undo2 className="h-4 w-4" />
                            ) : (
                              <Ban className="h-4 w-4" />
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Design-Consistent Student-Produced Response (SPR) Input */
                <div className="space-y-2.5">
                  <div
                    className={`flex items-center gap-4 rounded-xl border p-4 transition-all duration-150 ${
                      currentQuestionState.isSubmitted
                        ? currentQuestionState.isCorrect
                          ? 'border-emerald-500/50 bg-[#101F18] text-[#F5F5F5]'
                          : 'border-red-500/50 bg-[#221215] text-[#F5F5F5]'
                        : currentQuestionState.draftAnswer.trim()
                        ? 'border-[#F4F0EA] bg-[#18181B]'
                        : 'border-[#29292E] bg-[#111113] hover:border-[#3F3F46] focus-within:border-[#F4F0EA] focus-within:bg-[#18181B]'
                    }`}
                  >
                    <input
                      id="spr-answer-input"
                      type="text"
                      inputMode="decimal"
                      autoComplete="off"
                      disabled={currentQuestionState.isSubmitted}
                      value={currentQuestionState.draftAnswer}
                      onChange={(e) => handleSprChange(e.target.value)}
                      aria-label="Your numeric or fraction answer"
                      className="flex-1 bg-transparent font-mono text-base text-[#F5F5F5] focus:outline-none"
                    />

                    {currentQuestionState.isSubmitted &&
                      (currentQuestionState.isCorrect ? (
                        <Check className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : (
                        <X className="h-4 w-4 shrink-0 text-red-400" />
                      ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#71717A]">
                    <span>
                      Up to 5 characters for positive answers, 6 for negative
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        soundEngine.play('click');
                        setIsSprDirectionsOpen((prev) => !prev);
                      }}
                      className="text-[#A1A1AA] hover:text-[#F5F5F5] underline underline-offset-4 transition-colors cursor-pointer"
                    >
                      How to enter answers?
                    </button>
                  </div>
                </div>
              )}

              {/* Primary Check / Submit Action */}
              {!currentQuestionState.isSubmitted && (
                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs text-[#71717A]">
                    {currentQuestionState.draftAnswer.trim()
                      ? `Selected response: ${currentQuestionState.draftAnswer}`
                      : 'Select an answer to check your work'}
                  </span>

                  <Button3D
                    variant="primary"
                    size="lg"
                    disabled={!currentQuestionState.draftAnswer.trim()}
                    onClick={handleSubmit}
                    className="px-7"
                  >
                    <span>Check Answer</span>
                  </Button3D>
                </div>
              )}

              {/* Instant Feedback & Explanation Area */}
              {currentQuestionState.isSubmitted && (
                <div
                  className={`rounded-2xl border p-6 ${
                    currentQuestionState.isCorrect
                      ? 'animate-feedback-correct border-emerald-500/35 bg-[#0F1B15]'
                      : 'animate-feedback-incorrect border-red-500/35 bg-[#1D1113]'
                  }`}
                >
                  {/* Feedback Header with Friendly Microcopy */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-3">
                      {currentQuestionState.isCorrect ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="h-5 w-5 text-red-400 shrink-0" />
                      )}
                      <div>
                        <div
                          className={`text-sm font-semibold ${
                            currentQuestionState.isCorrect
                              ? 'text-emerald-300'
                              : 'text-red-300'
                          }`}
                        >
                          {currentQuestionState.isCorrect
                            ? 'Nice work — that is correct.'
                            : 'Not quite — review the explanation below.'}
                        </div>
                        <div className="text-xs text-[#A1A1AA] mt-0.5">
                          Your answer:{' '}
                          <span className="font-mono text-[#F5F5F5]">
                            {currentQuestionState.submittedAnswer}
                          </span>{' '}
                          • Correct answer:{' '}
                          <span className="font-mono text-emerald-300">
                            {question.correctAnswer.length > 0
                              ? question.correctAnswer.join(' or ')
                              : 'See explanation'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span className="font-mono text-xs text-[#A1A1AA]">
                      {formatShortDuration(currentQuestionState.timeSpent)}
                    </span>
                  </div>

                  {/* Explanation Body */}
                  <div className="mt-5">
                    <div className="mb-2.5 text-xs font-medium text-[#D6CEBF]">
                      Explanation
                    </div>
                    {question.explanation ? (
                      <RichMathContent
                        html={question.explanation}
                        variant="explanation"
                      />
                    ) : (
                      <p className="text-xs text-[#A1A1AA] italic">
                        An official explanation is not provided for this item in the
                        College Board Question Bank.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom Examination Navigation Bar */}
      <footer className="sticky bottom-0 z-30 border-t border-[#1F1F23] bg-[#0A0A0B]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-2.5 px-4 py-3 sm:px-6">
          <Button3D
            variant="secondary"
            size="md"
            disabled={currentIdx === 0}
            onClick={() => goToQuestionIndex(currentIdx - 1)}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Previous</span>
          </Button3D>

          {currentIdx < totalQuestions - 1 ? (
            <Button3D
              variant={
                currentQuestionState.isSubmitted ? 'primary' : 'secondary'
              }
              size="md"
              onClick={() => goToQuestionIndex(currentIdx + 1)}
            >
              <span>Next</span>
              <ArrowRight className="h-4 w-4" />
            </Button3D>
          ) : (
            <Button3D
              variant="primary"
              size="md"
              onClick={
                isCompletedSession
                  ? () => setIsSessionSummaryView(true)
                  : completeSession
              }
            >
              <span>Finish</span>
            </Button3D>
          )}
        </div>
      </footer>
    </div>
  );
};
