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
  Clock,
  Eye,
  EyeOff,
  Flag,
  LayoutGrid,
  Loader2,
  PenTool,
  RefreshCw,
  Share2,
  Undo2,
  X,
  XCircle,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  fetchQuestionDetail,
  isValidCompleteSprFormat,
} from '@/services/questionBank';
import { Question } from '@/types';
import { RichMathContent } from '@/components/question/RichMathContent';
import {
  HighlightablePassage,
  PassageHighlight,
} from '@/components/question/HighlightablePassage';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { Button3D } from '@/components/ui/Button3D';
import {
  CalculatorLayout,
  MathCalculatorPanel,
  MathReferenceSheet,
  SprDirectionsWindow,
} from '@/components/session/MathTools';
import {
  ScratchpadOverlay,
  ScratchpadStroke,
} from '@/components/session/ScratchpadOverlay';
import {
  ExamBreakScreen,
  ExamExitModal,
  ExamModuleReviewScreen,
  ExamPauseScreen,
  ExamQuestionGridPopover,
} from '@/components/session/ExamOverlays';
import { usePracticeShortcuts } from '@/hooks/usePracticeShortcuts';
import {
  formatDuration,
  formatShortDuration,
  getDifficultyBadgeInfo,
} from '@/utils/formatTime';
import { soundEngine } from '@/services/sound/soundEngine';

export const QuestionSolver: React.FC = () => {
  const {
    activeSession,
    isTransitioningExamModule,
    examTransitionError,
    setDraftAnswer,
    setQuestionHighlights,
    setQuestionEliminated,
    setQuestionScratchpad,
    submitAnswer,
    goToQuestionIndex,
    completeSession,
    closeActiveSession,
    exitAndSaveExam,
    discardSavedExam,
    togglePauseSession,
    toggleFlagQuestion,
    setExamPhase,
    skipExamBreak,
    lockCurrentModuleAndAdvance,
    syncSessionTime,
    setIsSessionSummaryView,
    metaMap,
  } = useApp();

  const [question, setQuestion] = useState<Question | null>(null);
  const [isLoadingQuestion, setIsLoadingQuestion] = useState<boolean>(true);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isScratchpadOpen, setIsScratchpadOpen] = useState<boolean>(false);
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [calculatorLayout, setCalculatorLayout] =
    useState<CalculatorLayout>('floating');
  const [calculatorDockWidth, setCalculatorDockWidth] = useState<number>(520);
  const [isResizingDock, setIsResizingDock] = useState<boolean>(false);
  const [footerHeight, setFooterHeight] = useState<number>(65);
  const [isDesktopSmUp, setIsDesktopSmUp] = useState<boolean>(true);
  const [isReferenceOpen, setIsReferenceOpen] = useState<boolean>(false);
  const [isSprDirectionsOpen, setIsSprDirectionsOpen] = useState<boolean>(false);
  const [isTimerHidden, setIsTimerHidden] = useState<boolean>(false);
  const [isShareCopied, setIsShareCopied] = useState<boolean>(false);
  const [isQuestionGridOpen, setIsQuestionGridOpen] = useState<boolean>(false);
  const [isExitModalOpen, setIsExitModalOpen] = useState<boolean>(false);
  const footerRef = useRef<HTMLElement | null>(null);
  const loadRequestIdRef = useRef<number>(0);
  const questionStatesRef = useRef(activeSession?.questionStates);
  questionStatesRef.current = activeSession?.questionStates;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncViewport = () => {
      const vw = window.innerWidth;
      const isSmUp = vw >= 640;
      setIsDesktopSmUp(isSmUp);
      if (!isSmUp) {
        setIsScratchpadOpen(false);
      }
      setCalculatorDockWidth((prev) => {
        const preferred = Math.min(580, Math.max(360, Math.round(vw * 0.45)));
        const maxAllowed = Math.max(360, Math.round(vw * 0.58));
        if (prev === 520 && vw < 1200) return preferred;
        return Math.min(Math.max(340, prev), maxAllowed);
      });
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  useEffect(() => {
    const el = footerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const syncFooter = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) setFooterHeight(h);
    };
    syncFooter();
    const observer = new ResizeObserver(syncFooter);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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

  const eliminatedMap = useMemo(
    () => activeSession?.eliminatedByQuestion || {},
    [activeSession?.eliminatedByQuestion]
  );
  const scratchpadMap = useMemo(
    () => activeSession?.scratchpadByQuestion || {},
    [activeSession?.scratchpadByQuestion]
  );
  const highlightMap = useMemo(
    () => activeSession?.highlightsByQuestion || {},
    [activeSession?.highlightsByQuestion]
  );

  const isCompletedSession = Boolean(activeSession?.completedAt);
  const isExamMode = activeSession?.mode === 'exam' && Boolean(activeSession?.exam);
  const isLiveExam = isExamMode && !isCompletedSession;
  const isExamReview = isExamMode && isCompletedSession;
  const activeExam = isExamMode ? activeSession?.exam : undefined;
  const activeModule = activeExam
    ? activeExam.modules[activeExam.currentModuleIndex]
    : undefined;
  const isTestingPhase = !isLiveExam || activeExam?.phase === 'testing';

  // Load current question details with stale-response guard for fast navigation
  const loadQuestion = useCallback(async (qId: string) => {
    const reqId = ++loadRequestIdRef.current;
    setIsLoadingQuestion(true);
    setQuestionError(null);
    try {
      const q = await fetchQuestionDetail(qId);
      if (loadRequestIdRef.current !== reqId) return;
      setQuestion(q);
    } catch (err) {
      if (loadRequestIdRef.current !== reqId) return;
      setQuestionError(
        err instanceof Error
          ? err.message
          : 'Failed to load question content from the Question Bank.'
      );
    } finally {
      if (loadRequestIdRef.current === reqId) {
        setIsLoadingQuestion(false);
      }
    }
  }, []);

  // Sync per-question stopwatch with accumulated question time when switching questions
  useEffect(() => {
    if (currentQuestionId) {
      const storedTime =
        questionStatesRef.current?.[currentQuestionId]?.timeSpent ?? 0;
      setIsShareCopied(false);
      setQuestionTimerMs(storedTime);
      lastTickRef.current = Date.now();
      loadQuestion(currentQuestionId);
    }
  }, [currentQuestionId, loadQuestion]);

  // Wall-Clock Timer: Question stopwatch (Topic Practice) or Module/Break countdown (Full Exam)
  useEffect(() => {
    if (!activeSession || isCompletedSession) {
      return;
    }

    if (isLiveExam) {
      if (activeExam?.isExamPaused || activeExam?.phase === 'completed') {
        return;
      }
    } else if (isLoadingQuestion || currentQuestionState?.isSubmitted) {
      return;
    }

    lastTickRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const rawDelta = now - lastTickRef.current;
      // Ignore long system-sleep jumps in untimed Topic Practice; keep strict clock in Live Exam
      const delta = isLiveExam ? rawDelta : Math.min(rawDelta, 2000);
      if (rawDelta > 0) {
        lastTickRef.current = now;
        if (!isLiveExam && document.visibilityState === 'hidden') {
          return;
        }
        if (delta > 0) {
          if (!isLiveExam || activeExam?.phase === 'testing') {
            setQuestionTimerMs((prev) => prev + delta);
          }
          const trackedQId =
            isLiveExam && activeExam?.phase !== 'testing' ? null : currentQuestionId;
          syncSessionTime(delta, trackedQId, delta);
        }
      }
    }, 250);

    const handleVisibilityChange = () => {
      const now = Date.now();
      if (document.visibilityState === 'hidden') {
        const rawDelta = now - lastTickRef.current;
        const delta = isLiveExam ? rawDelta : Math.min(rawDelta, 2000);
        if (delta > 0) {
          lastTickRef.current = now;
          if (!isLiveExam || activeExam?.phase === 'testing') {
            setQuestionTimerMs((prev) => prev + delta);
          }
          const trackedQId =
            isLiveExam && activeExam?.phase !== 'testing' ? null : currentQuestionId;
          syncSessionTime(delta, trackedQId, delta);
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
    isLiveExam,
    activeExam?.isExamPaused,
    activeExam?.phase,
    isLoadingQuestion,
    currentQuestionId,
    currentQuestionState?.isSubmitted,
    syncSessionTime,
  ]);

  // Auto-advance when live exam module timer or break timer expires
  useEffect(() => {
    if (!isLiveExam || !activeExam || activeExam.isExamPaused || isTransitioningExamModule) {
      return;
    }
    if (activeExam.phase === 'break' && activeExam.breakTimeRemainingMs <= 0) {
      skipExamBreak();
      return;
    }
    if (
      (activeExam.phase === 'testing' || activeExam.phase === 'module-review') &&
      activeModule &&
      !activeModule.locked &&
      activeModule.timeRemainingMs <= 0 &&
      !examTransitionError
    ) {
      lockCurrentModuleAndAdvance().catch(() => {});
    }
  }, [
    isLiveExam,
    activeExam,
    activeModule,
    isTransitioningExamModule,
    examTransitionError,
    skipExamBreak,
    lockCurrentModuleAndAdvance,
  ]);

  const totalQuestions = activeSession?.questionIds.length || 0;
  const currentIdx = activeSession?.currentIndex || 0;

  const handleSelectMcq = useCallback(
    (label: string) => {
      if (!currentQuestionId || !currentQuestionState || currentQuestionState.isSubmitted) {
        return;
      }
      const isCurrentlyEliminated = (
        eliminatedMap[currentQuestionId] || []
      ).includes(label);
      if (isCurrentlyEliminated) {
        return;
      }
      soundEngine.play('select');
      setDraftAnswer(currentQuestionId, label);
    },
    [currentQuestionId, currentQuestionState, eliminatedMap, setDraftAnswer]
  );

  const canSubmitAnswer = useMemo(() => {
    if (!question || !currentQuestionState || currentQuestionState.isSubmitted) {
      return false;
    }
    const draft = currentQuestionState.draftAnswer.trim();
    if (!draft) return false;
    if (question.questionType === 'spr') {
      return isValidCompleteSprFormat(draft);
    }
    return true;
  }, [question, currentQuestionState]);

  const handleSubmit = useCallback(async () => {
    if (!question || !canSubmitAnswer) {
      return;
    }
    await submitAnswer(question);
  }, [question, canSubmitAnswer, submitAnswer]);

  const handleToggleEliminateOption = useCallback(
    (label: string) => {
      if (!currentQuestionId || !currentQuestionState || currentQuestionState.isSubmitted) {
        return;
      }
      const currentElim = eliminatedMap[currentQuestionId] || [];
      const isNowEliminating = !currentElim.includes(label);
      soundEngine.play(isNowEliminating ? 'strikethrough' : 'restore');
      const next = isNowEliminating
        ? [...currentElim, label]
        : currentElim.filter((l) => l !== label);
      setQuestionEliminated(currentQuestionId, next);
      if (isNowEliminating && currentQuestionState.draftAnswer === label) {
        setDraftAnswer(currentQuestionId, '');
      }
    },
    [
      currentQuestionId,
      currentQuestionState,
      eliminatedMap,
      setQuestionEliminated,
      setDraftAnswer,
    ]
  );

  const handleUpdateScratchpadStrokes = useCallback(
    (qId: string, nextStrokes: ScratchpadStroke[]) => {
      setQuestionScratchpad(qId, nextStrokes);
    },
    [setQuestionScratchpad]
  );

  const handleToggleScratchpad = useCallback(() => {
    setIsScratchpadOpen((prev) => {
      const next = !prev;
      soundEngine.play(next ? 'toggleOpen' : 'toggleClose');
      return next;
    });
  }, []);

  const handleUpdateHighlights = useCallback(
    (qId: string, nextHighlights: PassageHighlight[]) => {
      setQuestionHighlights(qId, nextHighlights);
    },
    [setQuestionHighlights]
  );

  const handleEscapeOverlays = useCallback((): boolean => {
    if (isExitModalOpen) {
      setIsExitModalOpen(false);
      return true;
    }
    if (isQuestionGridOpen) {
      setIsQuestionGridOpen(false);
      return true;
    }
    if (isScratchpadOpen) {
      setIsScratchpadOpen(false);
      return true;
    }
    if (isSprDirectionsOpen) {
      setIsSprDirectionsOpen(false);
      return true;
    }
    if (isReferenceOpen) {
      setIsReferenceOpen(false);
      return true;
    }
    if (isCalculatorOpen) {
      setIsCalculatorOpen(false);
      return true;
    }
    return false;
  }, [
    isExitModalOpen,
    isQuestionGridOpen,
    isScratchpadOpen,
    isSprDirectionsOpen,
    isReferenceOpen,
    isCalculatorOpen,
  ]);

  const currentMeta = question || metaMap.get(currentQuestionId || '');
  const isMathSubject =
    (currentMeta?.subject || activeSession?.subject) === 'math';
  const hasPassage = Boolean(
    question?.passage && question.passage.trim().length > 0
  );
  // In Bluebook Digital SAT, only Reading & Writing uses the 2-column Passage/Question split;
  // Math is always a single column with any stimulus equation/table/graph directly above the stem.
  const useSplitPassageColumn = hasPassage && !isMathSubject;

  const isCurrentFlagged = Boolean(
    isLiveExam &&
      currentQuestionId &&
      activeExam?.flaggedQuestionIds.includes(currentQuestionId)
  );

  usePracticeShortcuts({
    enabled: Boolean(
      activeSession &&
        currentQuestionId &&
        currentQuestionState &&
        (!isLiveExam || (activeExam?.phase === 'testing' && !activeExam?.isExamPaused))
    ),
    isMcq: question?.questionType === 'mcq',
    isSubmitted: Boolean(currentQuestionState?.isSubmitted),
    hasDraftAnswer: canSubmitAnswer,
    canGoPrev: currentIdx > 0,
    canGoNext: currentIdx < totalQuestions - 1,
    canUseScratchpad: isDesktopSmUp,
    isLiveExam,
    onSelectOption: handleSelectMcq,
    onToggleEliminateOption: handleToggleEliminateOption,
    onSubmitAnswer: handleSubmit,
    onPrevQuestion: () => goToQuestionIndex(currentIdx - 1),
    onNextQuestion: () => goToQuestionIndex(currentIdx + 1),
    onToggleScratchpad: handleToggleScratchpad,
    onToggleFlag: isLiveExam && currentQuestionId
      ? () => {
          soundEngine.play(isCurrentFlagged ? 'deselect' : 'select');
          toggleFlagQuestion(currentQuestionId);
        }
      : undefined,
    onEscape: handleEscapeOverlays,
  });

  if (!activeSession || !currentQuestionId || !currentQuestionState) {
    return null;
  }

  const sectionLabel =
    currentMeta?.subjectLabel ||
    (activeSession.subject === 'rw' ? 'Reading & Writing' : 'Math');
  const diffBadge = getDifficultyBadgeInfo(currentMeta?.difficulty);
  const currentHighlights = highlightMap[currentQuestionId] || [];
  const footerBtnClass = 'h-9 whitespace-nowrap sm:h-10 sm:px-4 sm:py-2 sm:text-sm';
  const footerNavBtnClass = `${footerBtnClass} min-w-[84px] sm:min-w-[108px]`;

  const eliminatedForCurrent = eliminatedMap[currentQuestionId] || [];

  const toggleEliminateOption = (label: string, e: React.MouseEvent) => {
    e.stopPropagation();
    handleToggleEliminateOption(label);
  };

  const handleSprChange = (rawVal: string) => {
    if (currentQuestionState.isSubmitted) return;
    const val = rawVal.trim().replace(/,/g, '');
    if (!/^-?[0-9./]*$/.test(val)) return;
    if (val.startsWith('/') || val.startsWith('-/')) return;
    const maxLen = val.startsWith('-') ? 6 : 5;
    if (val.length > maxLen) return;
    const slashCount = (val.match(/\//g) || []).length;
    const dotCount = (val.match(/\./g) || []).length;
    if (slashCount > 1 || dotCount > 1 || (slashCount > 0 && dotCount > 0)) {
      return;
    }
    setDraftAnswer(currentQuestionId, val);
  };

  const handleSprHelperKey = (symbol: '-' | '/' | '.') => {
    if (currentQuestionState.isSubmitted) return;
    const cur = currentQuestionState.draftAnswer;
    if (symbol === '-') {
      const next = cur.startsWith('-') ? cur.slice(1) : `-${cur}`;
      handleSprChange(next);
      return;
    }
    handleSprChange(`${cur}${symbol}`);
  };

  const handleShareQuestion = async () => {
    soundEngine.play('copy');
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

  const isCalculatorDocked =
    isMathSubject &&
    isCalculatorOpen &&
    calculatorLayout !== 'floating' &&
    isDesktopSmUp;

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0B] text-[#F5F5F5] animate-page-fade">
      {/* Dedicated Examination Top Header */}
      <header className="sticky top-0 z-30 h-16 w-full border-b border-[#1F1F23] bg-[#0A0A0B]/90 backdrop-blur-md">
        <div className="relative mx-auto flex h-full max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6">
          {/* Left: 1600prep Brand Mark & Wordmark (Exit / Save & Exit during Live Exam) */}
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={() => {
                soundEngine.play('click');
                if (isLiveExam) {
                  setIsExitModalOpen(true);
                } else {
                  closeActiveSession();
                }
              }}
              className="group flex items-center cursor-pointer focus:outline-none"
              title={isLiveExam ? 'Exit exam' : 'Return to main menu'}
            >
              <BrandLogo />
            </button>
          </div>

          {/* Center (lg+): Countdown Timer + Pause (Live Exam) or Question Timer (Practice/Review) */}
          <div className="flex shrink-0 items-center gap-1.5 lg:absolute lg:left-1/2 lg:-translate-x-1/2">
            {(() => {
              const displayMs = isLiveExam
                ? activeExam?.phase === 'break'
                  ? activeExam.breakTimeRemainingMs
                  : activeModule?.timeRemainingMs ?? 0
                : currentQuestionState.isSubmitted
                ? currentQuestionState.timeSpent
                : questionTimerMs;

              const timerColorClass =
                isLiveExam && !isTimerHidden && activeExam?.phase !== 'break'
                  ? displayMs <= 60_000
                    ? 'text-red-400'
                    : displayMs <= 5 * 60_000
                    ? 'text-amber-300'
                    : 'text-[#F5F5F5]'
                  : 'text-[#F5F5F5]';

              return (
                <span
                  className={`font-mono text-base sm:text-xl font-medium tabular-nums tracking-tight ${timerColorClass}`}
                  title={isLiveExam ? 'Time remaining' : 'Question elapsed time'}
                >
                  {isTimerHidden ? '—' : formatDuration(displayMs)}
                </span>
              );
            })()}

            <button
              type="button"
              onClick={() => {
                soundEngine.play('click');
                setIsTimerHidden((prev) => !prev);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#71717A] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
              title={isTimerHidden ? 'Show timer' : 'Hide timer'}
              aria-label={isTimerHidden ? 'Show timer' : 'Hide timer'}
            >
              {isTimerHidden ? (
                <Eye className="h-4 w-4" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
            </button>

            {isLiveExam && activeExam?.phase !== 'break' && (
              <button
                type="button"
                onClick={() => {
                  soundEngine.play('click');
                  togglePauseSession();
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors cursor-pointer ${
                  activeExam?.isExamPaused
                    ? 'bg-[#18181B] text-[#69ff00]'
                    : 'text-[#71717A] hover:bg-[#18181B] hover:text-[#F5F5F5]'
                }`}
                title={activeExam?.isExamPaused ? 'Resume practice' : 'Pause practice'}
                aria-label={activeExam?.isExamPaused ? 'Resume practice' : 'Pause practice'}
              >
                {activeExam?.isExamPaused ? (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M7.5 5.6v12.8a.9.9 0 0 0 1.38.76l10.2-6.4a.9.9 0 0 0 0-1.52L8.88 4.84A.9.9 0 0 0 7.5 5.6z" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    className="h-3.5 w-3.5"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <rect x="6" y="4.5" width="4" height="15" rx="1.25" />
                    <rect x="14" y="4.5" width="4" height="15" rx="1.25" />
                  </svg>
                )}
              </button>
            )}
          </div>

          {/* Right: Workspace Tools (Calculator, Reference on all screens; Scratchpad sm+) + Share */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1.5">
            {(!isLiveExam || (activeExam?.phase === 'testing' && !activeExam?.isExamPaused)) && (
              <div className="flex items-center gap-0.5 sm:gap-1.5">
                {isMathSubject && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setIsCalculatorOpen((prev) => {
                          const next = !prev;
                          soundEngine.play(next ? 'toggleOpen' : 'toggleClose');
                          return next;
                        });
                      }}
                      className={`inline-flex h-7 w-7 sm:h-8 sm:w-auto items-center justify-center gap-1.5 rounded-full sm:px-3 text-xs transition-colors cursor-pointer ${
                        isCalculatorOpen
                          ? 'bg-[#18181B] text-[#69ff00]'
                          : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                      }`}
                      title="Graphing Calculator"
                      aria-label="Graphing Calculator"
                      aria-pressed={isCalculatorOpen}
                    >
                      <Calculator className="h-4 w-4" />
                      <span className="hidden lg:inline">Calculator</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsReferenceOpen((prev) => {
                          const next = !prev;
                          soundEngine.play(next ? 'toggleOpen' : 'toggleClose');
                          return next;
                        });
                      }}
                      className={`inline-flex h-7 w-7 sm:h-8 sm:w-auto items-center justify-center gap-1.5 rounded-full sm:px-3 text-xs transition-colors cursor-pointer ${
                        isReferenceOpen
                          ? 'bg-[#18181B] text-[#69ff00]'
                          : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                      }`}
                      title="Math Reference Sheet"
                      aria-label="Math Reference Sheet"
                      aria-pressed={isReferenceOpen}
                    >
                      <BookOpen className="h-4 w-4" />
                      <span className="hidden lg:inline">Reference</span>
                    </button>
                  </>
                )}

                {/* Scratchpad Toggle Button (Desktop/Tablet sm+) */}
                <button
                  type="button"
                  onClick={handleToggleScratchpad}
                  className={`hidden sm:inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs transition-colors cursor-pointer ${
                    isScratchpadOpen
                      ? 'bg-[#18181B] text-[#69ff00]'
                      : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                  }`}
                  title="Toggle Scratchpad"
                  aria-label="Toggle Scratchpad"
                  aria-pressed={isScratchpadOpen}
                >
                  <PenTool className="h-4 w-4" />
                  <span className="hidden lg:inline">Scratchpad</span>
                </button>
              </div>
            )}

            {/* Icon-only Share Question Link Button (hidden during live exam to keep workspace spoiler-free) */}
            {!isLiveExam && (
              <button
                type="button"
                onClick={handleShareQuestion}
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:text-[#F5F5F5] transition-colors cursor-pointer"
                title={isShareCopied ? 'Link copied!' : 'Copy link to this question'}
                aria-label="Copy link to this question"
              >
                {isShareCopied ? (
                  <Check className="h-4 w-4 text-emerald-400" />
                ) : (
                  <Share2 className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Floating & Dockable SAT Math Calculator, Reference Sheet & SPR Directions Windows */}
      {isMathSubject && (
        <>
          <MathCalculatorPanel
            isOpen={isCalculatorOpen && isTestingPhase && !activeExam?.isExamPaused}
            layout={calculatorLayout}
            dockWidth={calculatorDockWidth}
            footerHeight={footerHeight}
            onChangeLayout={setCalculatorLayout}
            onChangeDockWidth={setCalculatorDockWidth}
            onResizingDockChange={setIsResizingDock}
            onClose={() => {
              soundEngine.play('toggleClose');
              setIsCalculatorOpen(false);
            }}
          />
          <MathReferenceSheet
            isOpen={isReferenceOpen && isTestingPhase && !activeExam?.isExamPaused}
            onClose={() => {
              soundEngine.play('toggleClose');
              setIsReferenceOpen(false);
            }}
          />
        </>
      )}
      <SprDirectionsWindow
        isOpen={isSprDirectionsOpen && isTestingPhase && !activeExam?.isExamPaused}
        onClose={() => {
          soundEngine.play('toggleClose');
          setIsSprDirectionsOpen(false);
        }}
      />

      {/* Full-Screen Examination Area (between Header and Footer) */}
      <div
        style={{
          paddingLeft:
            isCalculatorDocked && isTestingPhase && !activeExam?.isExamPaused && calculatorLayout === 'left'
              ? `${calculatorDockWidth}px`
              : undefined,
          paddingRight:
            isCalculatorDocked && isTestingPhase && !activeExam?.isExamPaused && calculatorLayout === 'right'
              ? `${calculatorDockWidth}px`
              : undefined,
        }}
        className={`relative flex w-full flex-1 flex-col ${
          isResizingDock
            ? 'transition-none'
            : 'transition-[padding] duration-200 ease-out'
        }`}
      >
        {/* Transparent Full-Screen HTML5 Canvas Scratchpad Overlay */}
        <ScratchpadOverlay
          isOpen={
            isScratchpadOpen &&
            isDesktopSmUp &&
            isTestingPhase &&
            !activeExam?.isExamPaused
          }
          questionId={currentQuestionId}
          strokes={scratchpadMap[currentQuestionId] || []}
          onChangeStrokes={handleUpdateScratchpadStrokes}
          onClose={() => setIsScratchpadOpen(false)}
        />

        {/* Live Exam Interstitial Screens: Paused, 10m Break, or End-of-Module Review */}
        {isLiveExam && activeExam?.isExamPaused ? (
          <ExamPauseScreen
            moduleLabel={activeModule?.label || activeSession.title}
            timeRemainingMs={
              activeExam.phase === 'break'
                ? activeExam.breakTimeRemainingMs
                : activeModule?.timeRemainingMs ?? 0
            }
            onResume={togglePauseSession}
          />
        ) : isLiveExam && activeExam?.phase === 'break' ? (
          <ExamBreakScreen
            breakTimeRemainingMs={activeExam.breakTimeRemainingMs}
            onStartMathSection={skipExamBreak}
          />
        ) : isLiveExam && activeExam?.phase === 'module-review' && activeModule ? (
          <ExamModuleReviewScreen
            activeModule={activeModule}
            questionStates={activeSession.questionStates}
            flaggedQuestionIds={activeExam.flaggedQuestionIds}
            isFinalModule={
              activeModule.moduleNumber === 2 &&
              (activeExam.track !== 'full' || activeModule.subject === 'math')
            }
            isTransitioning={isTransitioningExamModule}
            isTimeExpired={activeModule.timeRemainingMs <= 0}
            transitionError={examTransitionError}
            onJumpToQuestion={(idx) => goToQuestionIndex(idx)}
            onBackToLastQuestion={() => goToQuestionIndex(activeModule.questionIds.length - 1)}
            onSubmitModule={() => lockCurrentModuleAndAdvance()}
          />
        ) : (
        /* Dedicated Examination Content Container */
        <div
          className={`mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-8 sm:px-6 lg:py-10 ${
            isScratchpadOpen && isDesktopSmUp && isTestingPhase && !activeExam?.isExamPaused
              ? 'pointer-events-none select-none'
              : ''
          }`}
        >
        {isLoadingQuestion ? (
          <div className="flex flex-1 flex-col items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-[#69ff00]" />
            <p className="mt-3 text-xs text-[#71717A]">
              Loading question {currentIdx + 1}...
            </p>
          </div>
        ) : questionError || !question ? (
          <div className="mx-auto my-16 max-w-md rounded-2xl border border-[#4C2024] bg-[#111113] p-7 text-center animate-content-in">
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
            key={question.id}
            className={`grid flex-1 gap-8 lg:gap-12 animate-content-in ${
              useSplitPassageColumn
                ? 'grid-cols-1 lg:grid-cols-12 items-start'
                : 'mx-auto w-full max-w-3xl grid-cols-1'
            }`}
          >
            {/* Left Examination Column: Reading & Writing Passage (when present) */}
            {useSplitPassageColumn && (
              <div className="lg:col-span-6 lg:border-r lg:border-[#1F1F23] lg:pr-10 lg:sticky lg:top-20 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
                <div className="mb-4 border-b border-[#1F1F23] pb-2 text-xs text-[#71717A]">
                  Passage
                </div>

                <HighlightablePassage
                  html={question.passage}
                  highlights={currentHighlights}
                  onChangeHighlights={(next) =>
                    handleUpdateHighlights(currentQuestionId, next)
                  }
                />
              </div>
            )}

            {/* Right Examination Column (or Centered Column for Math): Question Stem, Choices, Feedback */}
            <div
              className={`${
                useSplitPassageColumn ? 'lg:col-span-6' : ''
              } space-y-8 min-w-0`}
            >
              {/* Question Metadata Header: Spoiler-Free Module Label + Mark for Review (Live Exam) OR Full Taxonomy (Practice/Review) */}
              <div>
                <div className="mb-4 flex items-center justify-between gap-2 sm:gap-3 border-b border-[#1F1F23] pb-3">
                  {isLiveExam ? (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                        <span className="flex h-6 min-w-[1.5rem] shrink-0 px-2 items-center justify-center rounded-full bg-[#69ff00] font-mono text-xs font-semibold text-[#0A0A0B]">
                          {currentIdx + 1}
                        </span>
                        <span className="hidden sm:inline font-medium text-[#F5F5F5] truncate">
                          {activeModule?.label || sectionLabel}
                        </span>
                        <span className="sm:hidden font-medium text-[#F5F5F5] truncate">
                          {activeModule?.shortLabel || sectionLabel}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.play(isCurrentFlagged ? 'deselect' : 'select');
                          toggleFlagQuestion(currentQuestionId);
                        }}
                        aria-pressed={isCurrentFlagged}
                        title="Mark question for review (F)"
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer ${
                          isCurrentFlagged
                            ? 'border-amber-500/45 bg-amber-500/12 text-amber-300'
                            : 'border-[#29292E] bg-[#111113] text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#F5F5F5]'
                        }`}
                      >
                        <Flag
                          className={`h-3 w-3 ${
                            isCurrentFlagged ? 'fill-amber-400 text-amber-400' : ''
                          }`}
                        />
                        <span className="hidden sm:inline">
                          {isCurrentFlagged ? 'Flagged' : 'Mark for Review'}
                        </span>
                        <span className="sm:hidden">
                          {isCurrentFlagged ? 'Flagged' : 'Review'}
                        </span>
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 items-center gap-2 text-xs">
                        <span className="flex h-6 min-w-[1.5rem] shrink-0 px-2 items-center justify-center rounded-full bg-[#69ff00] font-mono text-xs font-semibold text-[#0A0A0B]">
                          {currentIdx + 1}
                        </span>

                        <span className="hidden sm:inline font-medium text-[#F5F5F5] shrink-0">
                          {sectionLabel}
                        </span>

                        {currentMeta?.domainLabel && (
                          <>
                            <span className="hidden sm:inline text-[#3F3F46] shrink-0">•</span>
                            <span
                              className={`${
                                currentMeta?.skillLabel ? 'hidden sm:inline' : 'truncate min-w-0'
                              } text-[#D4D4D8] sm:shrink-0`}
                            >
                              {currentMeta.domainLabel}
                            </span>
                          </>
                        )}

                        {currentMeta?.skillLabel && (
                          <>
                            <span className="hidden sm:inline text-[#3F3F46] shrink-0">•</span>
                            <span
                              className="min-w-0 truncate text-[#D4D4D8] sm:text-[#A1A1AA]"
                              title={currentMeta.skillLabel}
                            >
                              {currentMeta.skillLabel}
                            </span>
                          </>
                        )}

                        {!currentMeta?.skillLabel && !currentMeta?.domainLabel && (
                          <span className="sm:hidden font-medium text-[#F5F5F5] truncate min-w-0">
                            {sectionLabel}
                          </span>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
                        {currentMeta?.difficulty && (
                          <span
                            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${diffBadge.className}`}
                          >
                            {diffBadge.label}
                          </span>
                        )}

                        <span className="font-mono text-xs text-[#71717A] shrink-0">
                          ID {currentQuestionId}
                        </span>
                      </div>
                    </>
                  )}
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
                      optionSurface = 'border-[#69ff00]/80 bg-[#18181B]';
                      badgeStyle =
                        'border-[#69ff00] bg-[#69ff00] text-[#0A0A0B] font-semibold';
                    }

                    return (
                      <div
                        key={opt.id}
                        className={`group relative flex items-center rounded-2xl border transition-all duration-150 ${optionSurface}`}
                      >
                        {/* Full-width visual cross-out line that strikes across text, KaTeX equations, SVGs, and image formulas alike */}
                        {isEliminated && (
                          <div
                            aria-hidden="true"
                            className="pointer-events-none absolute left-3 right-12 top-1/2 -translate-y-1/2 h-[2px] rounded-full bg-[#A1A1AA]/85 z-10"
                          />
                        )}

                        <button
                          type="button"
                          disabled={isSubmitted || isEliminated}
                          aria-pressed={isSelected}
                          onClick={() => handleSelectMcq(opt.label)}
                          className={`flex flex-1 min-w-0 items-center gap-4 rounded-2xl p-4 text-left focus-visible:outline-2 focus-visible:outline-[#69ff00] focus-visible:outline-offset-[-2px] ${
                            isSubmitted
                              ? 'cursor-default'
                              : isEliminated
                              ? 'cursor-not-allowed'
                              : 'cursor-pointer'
                          }`}
                        >
                          <div
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs transition-all ${badgeStyle} ${
                              isEliminated ? 'opacity-40' : ''
                            }`}
                          >
                            {opt.label}
                          </div>

                          <div
                            className={`flex-1 min-w-0 transition-opacity ${
                              isEliminated
                                ? 'opacity-40 grayscale select-none'
                                : ''
                            }`}
                          >
                            <RichMathContent
                              html={opt.content}
                              variant="option"
                            />
                          </div>
                        </button>

                        {isSubmitted ? (
                          isCorrectOption || isSelected ? (
                            <div className="pr-4 shrink-0">
                              {isCorrectOption ? (
                                <Check className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <X className="h-4 w-4 text-red-400" />
                              )}
                            </div>
                          ) : null
                        ) : (
                          <div className="pr-3 shrink-0">
                            <button
                              type="button"
                              onClick={(e) =>
                                toggleEliminateOption(opt.label, e)
                              }
                              title={
                                isEliminated
                                  ? `Restore answer choice ${opt.label} (Shift+${opt.label})`
                                  : `Cross out answer choice ${opt.label} (Shift+${opt.label})`
                              }
                              aria-label={
                                isEliminated
                                  ? `Restore answer choice ${opt.label}`
                                  : `Cross out answer choice ${opt.label}`
                              }
                              className={`relative z-20 flex h-7 w-7 items-center justify-center rounded-full transition-all cursor-pointer ${
                                isEliminated
                                  ? 'text-white opacity-100 hover:bg-[#1F1F23] hover:text-white'
                                  : 'text-[#71717A] opacity-50 group-hover:opacity-100 hover:bg-[#1F1F23] hover:text-[#F5F5F5]'
                              }`}
                            >
                              {isEliminated ? (
                                <Undo2 className="h-4 w-4" />
                              ) : (
                                <Ban className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                /* Design-Consistent Student-Produced Response (SPR) Input */
                <div className="space-y-2.5">
                  <div
                    className={`flex items-center gap-4 rounded-2xl border p-4 transition-all duration-150 ${
                      currentQuestionState.isSubmitted
                        ? currentQuestionState.isCorrect
                          ? 'border-emerald-500/50 bg-[#101F18] text-[#F5F5F5]'
                          : 'border-red-500/50 bg-[#221215] text-[#F5F5F5]'
                        : currentQuestionState.draftAnswer.trim()
                        ? 'border-[#69ff00]/75 bg-[#18181B]'
                        : 'border-[#29292E] bg-[#111113] hover:border-[#3F3F46] focus-within:border-[#69ff00] focus-within:bg-[#18181B]'
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
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && canSubmitAnswer) {
                          e.preventDefault();
                          handleSubmit();
                        } else if (e.key === 'Escape') {
                          e.currentTarget.blur();
                        }
                      }}
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

                  {/* Mobile quick-insert helper keys since inputMode="decimal" omits '/' and often '-' on iOS/Android */}
                  {!currentQuestionState.isSubmitted && (
                    <div className="flex sm:hidden items-center gap-2 px-1">
                      <span className="text-xs text-[#71717A]">Quick keys:</span>
                      {(
                        [
                          { char: '-', label: '−' },
                          { char: '/', label: '/' },
                          { char: '.', label: '.' },
                        ] as const
                      ).map((k) => (
                        <button
                          key={k.char}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleSprHelperKey(k.char)}
                          className="flex h-8 min-w-[2.5rem] items-center justify-center rounded-full border border-[#29292E] bg-[#18181B] px-3 font-mono text-sm font-medium text-[#F5F5F5] active:scale-95 transition-transform"
                          aria-label={`Insert ${k.char === '-' ? 'negative sign' : k.char === '/' ? 'fraction slash' : 'decimal point'}`}
                        >
                          {k.label}
                        </button>
                      ))}
                    </div>
                  )}

                  {!currentQuestionState.isSubmitted &&
                    currentQuestionState.draftAnswer.trim().length > 0 &&
                    !canSubmitAnswer && (
                      <p className="px-1 text-xs text-amber-300/90">
                        Enter a complete number or fraction (for example, 7/2 or -1.5).
                      </p>
                    )}

                  <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-[#71717A]">
                    <span>
                      Up to 5 characters for positive answers, 6 for negative
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setIsSprDirectionsOpen((prev) => {
                          const next = !prev;
                          soundEngine.play(next ? 'toggleOpen' : 'toggleClose');
                          return next;
                        });
                      }}
                      className="text-[#A1A1AA] hover:text-[#F5F5F5] underline underline-offset-4 transition-colors cursor-pointer"
                    >
                      How to enter answers?
                    </button>
                  </div>
                </div>
              )}

              {/* Primary Check / Submit Action (Topic Practice only) */}
              {!isLiveExam && !currentQuestionState.isSubmitted && (
                <div className="flex items-center justify-end pt-2">
                  <Button3D
                    variant="primary"
                    size="lg"
                    disabled={!canSubmitAnswer}
                    onClick={handleSubmit}
                    className="px-7"
                  >
                    <span>Check Answer</span>
                  </Button3D>
                </div>
              )}

              {/* Instant Feedback & Explanation Area (Topic Practice + Post-Exam Review Mode only) */}
              {!isLiveExam && currentQuestionState.isSubmitted && (
                <div
                  aria-live="polite"
                  className={`overflow-hidden rounded-2xl border border-[#29292E] bg-[#111113] ${
                    currentQuestionState.isCorrect
                      ? 'animate-feedback-correct'
                      : 'animate-feedback-incorrect'
                  }`}
                >
                  {/* Structured Status & Answer Comparison Header */}
                  <div className="border-b border-[#1F1F23] bg-[#141417] px-5 py-4 sm:px-6">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                            currentQuestionState.isCorrect
                              ? 'bg-emerald-500/15 text-emerald-400'
                              : 'bg-red-500/15 text-red-400'
                          }`}
                        >
                          {currentQuestionState.isCorrect ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                        </div>
                        <span
                          className={`text-sm font-semibold ${
                            currentQuestionState.isCorrect
                              ? 'text-emerald-400'
                              : 'text-red-400'
                          }`}
                        >
                          {currentQuestionState.isCorrect
                            ? 'Correct'
                            : 'Incorrect'}
                        </span>
                      </div>

                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#29292E] bg-[#0A0A0B] px-3 py-1 text-xs font-medium tabular-nums text-[#A1A1AA]">
                        <Clock className="h-3 w-3 text-[#71717A]" />
                        <span>
                          {formatShortDuration(currentQuestionState.timeSpent)}
                        </span>
                      </span>
                    </div>

                    {/* Cohesive Answer Comparison Strip */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {currentQuestionState.isCorrect ? (
                        <div className="inline-flex items-center gap-2 rounded-full border border-[#29292E] bg-[#0A0A0B] px-3.5 py-1.5 text-xs">
                          <span className="text-[#71717A]">Answer</span>
                          <span className="font-mono font-semibold text-emerald-400">
                            {currentQuestionState.submittedAnswer}
                          </span>
                        </div>
                      ) : (
                        <>
                          <div className="inline-flex items-center gap-2 rounded-full border border-[#29292E] bg-[#0A0A0B] px-3.5 py-1.5 text-xs">
                            <span className="text-[#71717A]">Your answer</span>
                            <span className="font-mono font-semibold text-red-400">
                              {currentQuestionState.submittedAnswer || 'None'}
                            </span>
                          </div>

                          <div className="inline-flex items-center gap-2 rounded-full border border-[#3F3F46] bg-[#18181B] px-3.5 py-1.5 text-xs">
                            <span className="text-[#A1A1AA]">Correct answer</span>
                            <span className="font-mono font-semibold text-[#F5F5F5]">
                              {question.correctAnswer.length > 0
                                ? question.correctAnswer.join(' or ')
                                : 'See explanation'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Explanation Body */}
                  <div className="p-5 sm:p-6">
                    <div className="mb-3 flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-[#71717A]" />
                      <h3 className="text-sm font-semibold text-[#F5F5F5]">
                        Explanation
                      </h3>
                    </div>

                    {question.explanation ? (
                      <RichMathContent
                        html={question.explanation}
                        variant="explanation"
                      />
                    ) : (
                      <p className="text-sm text-[#A1A1AA]">
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
        )}
      </div>

      {/* Bottom Examination Navigation Bar */}
      {(!isLiveExam || (activeExam?.phase === 'testing' && !activeExam?.isExamPaused)) && (
        <footer
          ref={footerRef}
          className="sticky bottom-0 z-30 border-t border-[#1F1F23] bg-[#0A0A0B]/95 backdrop-blur-md"
        >
          <div
            className={
              isLiveExam || isExamReview
                ? 'mx-auto grid max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 pt-2.5 pb-3.5 sm:gap-2.5 sm:px-6 sm:pt-3 sm:pb-4'
                : 'mx-auto flex max-w-6xl items-center justify-between gap-2 px-3 pt-2.5 pb-3.5 sm:gap-2.5 sm:px-6 sm:pt-3 sm:pb-4'
            }
          >
            {/* Left Slot */}
            {isLiveExam ? (
              <div
                className="hidden md:block md:col-start-1 md:row-start-1 md:justify-self-start"
                aria-hidden="true"
              />
            ) : isExamReview ? (
              <div className="hidden md:block md:col-start-1 md:row-start-1 md:justify-self-start">
                <Button3D
                  variant="secondary"
                  size="sm"
                  className={`${footerBtnClass} shrink-0`}
                  onClick={() => setIsSessionSummaryView(true)}
                >
                  <span>Score Report</span>
                </Button3D>
              </div>
            ) : (
              <Button3D
                variant="secondary"
                size="sm"
                className={`${footerBtnClass} shrink-0`}
                onClick={
                  isCompletedSession
                    ? () => setIsSessionSummaryView(true)
                    : completeSession
                }
              >
                <span>Complete Session</span>
              </Button3D>
            )}

            {/* Bottom-Center Slot: Question Navigator Trigger */}
            {(isLiveExam || isExamReview) && (
              <Button3D
                variant="secondary"
                size="sm"
                className={`${footerBtnClass} col-start-2 row-start-1 justify-self-center shrink-0`}
                onClick={() => {
                  soundEngine.play('click');
                  setIsQuestionGridOpen((prev) => !prev);
                }}
                aria-expanded={isQuestionGridOpen}
              >
                <LayoutGrid className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span className="hidden sm:inline">
                  Question {currentIdx + 1} of {totalQuestions}
                </span>
                <span className="sm:hidden tabular-nums">
                  {currentIdx + 1}/{totalQuestions}
                </span>
              </Button3D>
            )}

            {/* Navigation Controls */}
            <div
              className={
                isLiveExam || isExamReview
                  ? 'contents md:col-start-3 md:row-start-1 md:justify-self-end md:flex md:shrink-0 md:items-center md:gap-2.5'
                  : 'flex shrink-0 items-center gap-2 sm:gap-2.5'
              }
            >
              <Button3D
                variant="secondary"
                size="sm"
                className={`${footerNavBtnClass} ${
                  isLiveExam || isExamReview
                    ? 'col-start-1 row-start-1 justify-self-start'
                    : ''
                }`}
                silentClick
                disabled={currentIdx === 0}
                onClick={() => {
                  soundEngine.play('navigate');
                  goToQuestionIndex(currentIdx - 1);
                }}
              >
                <ArrowLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                <span>Previous</span>
              </Button3D>

              {currentIdx < totalQuestions - 1 ? (
                <Button3D
                  variant={
                    !isLiveExam && currentQuestionState.isSubmitted
                      ? 'primary'
                      : 'secondary'
                  }
                  size="sm"
                  className={`${footerNavBtnClass} ${
                    isLiveExam || isExamReview
                      ? 'col-start-3 row-start-1 justify-self-end'
                      : ''
                  }`}
                  silentClick
                  onClick={() => {
                    soundEngine.play('navigate');
                    goToQuestionIndex(currentIdx + 1);
                  }}
                >
                  <span>Next</span>
                  <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button3D>
              ) : isLiveExam ? (
                <Button3D
                  variant="primary"
                  size="sm"
                  className={`${footerNavBtnClass} col-start-3 row-start-1 justify-self-end`}
                  onClick={() => {
                    soundEngine.play('click');
                    setExamPhase('module-review');
                  }}
                >
                  <span>Check Work</span>
                  <ArrowRight className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </Button3D>
              ) : (
                <Button3D
                  variant="primary"
                  size="sm"
                  className={`${footerNavBtnClass} ${
                    isExamReview ? 'col-start-3 row-start-1 justify-self-end' : ''
                  }`}
                  onClick={
                    isCompletedSession
                      ? () => setIsSessionSummaryView(true)
                      : completeSession
                  }
                >
                  <span>{isExamReview ? 'Report' : 'Finish'}</span>
                </Button3D>
              )}
            </div>
          </div>
        </footer>
      )}

      {/* Question Navigator Popover (Live Exam & Post-Exam Review) */}
      <ExamQuestionGridPopover
        isOpen={isQuestionGridOpen}
        questionIds={activeSession.questionIds}
        currentIndex={currentIdx}
        questionStates={activeSession.questionStates}
        flaggedQuestionIds={activeExam?.flaggedQuestionIds || []}
        isReviewMode={isExamReview}
        modules={isExamReview ? activeExam?.modules : undefined}
        moduleLabel={isExamReview ? 'All Questions' : activeModule?.label}
        onSelectIndex={goToQuestionIndex}
        onGoToCheckWork={() => {
          setIsQuestionGridOpen(false);
          if (isExamReview) {
            setIsSessionSummaryView(true);
          } else {
            setExamPhase('module-review');
          }
        }}
        onClose={() => setIsQuestionGridOpen(false)}
      />

      {/* Live Exam Exit Confirmation Modal */}
      <ExamExitModal
        isOpen={isExitModalOpen}
        onContinue={() => setIsExitModalOpen(false)}
        onSaveAndExit={() => {
          setIsExitModalOpen(false);
          exitAndSaveExam();
        }}
        onDiscard={() => {
          setIsExitModalOpen(false);
          discardSavedExam().then(() => closeActiveSession());
        }}
      />
    </div>
  );
};
