'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Attempt,
  ExamPhase,
  ExamTrack,
  HomePracticeTab,
  PracticeFilters,
  PracticeMode,
  Question,
  QuestionMeta,
  Session,
  SessionQuestionState,
  TaxonomyData,
  UserSettings,
} from '@/types';
import {
  DEFAULT_USER_SETTINGS,
  loadUserSettings,
  saveUserSettings,
} from '@/services/storage/preferences';
import {
  addSeenExamQuestionIds,
  clearActiveExamSession,
  getSeenExamQuestionIds,
  loadActiveExamSession,
  saveActiveExamSession,
} from '@/services/storage/db';
import {
  evaluateAnswer,
  fetchQuestionDetail,
  initializeCatalog,
  prefetchQuestions,
  selectQuestionsForSession,
} from '@/services/questionBank';
import {
  buildExamModule,
  buildInitialExamModules,
  EXAM_BREAK_TIME_MS,
} from '@/services/questionBank/examBuilder';
import {
  computeExamScoreReport,
  determineModule2Tier,
} from '@/services/scoring/satScorer';
import { soundEngine } from '@/services/sound/soundEngine';

interface AppContextValue {
  // Catalog
  taxonomy: TaxonomyData | null;
  metas: QuestionMeta[];
  metaMap: Map<string, QuestionMeta>;
  isCatalogLoading: boolean;
  catalogError: string | null;
  isOfflineFallback: boolean;
  offlineWarning: string | null;
  reloadCatalog: (forceRefresh?: boolean) => Promise<void>;

  // User Preferences (stored locally on device)
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;

  // Workspace Navigation
  homeTab: HomePracticeTab;
  setHomeTab: (tab: HomePracticeTab) => void;

  // Active Session & Stopwatch
  activeSession: Session | null;
  savedResumeExam: Session | null;
  isTransitioningExamModule: boolean;
  isSessionSummaryView: boolean;
  setIsSessionSummaryView: (val: boolean) => void;
  startPracticeSession: (
    filters: PracticeFilters,
    mode: PracticeMode,
    title: string,
    explicitQuestionIds?: string[]
  ) => Promise<Session>;
  startFullExam: (track: ExamTrack) => Promise<Session>;
  resumeSavedExam: () => void;
  discardSavedExam: () => Promise<void>;
  exitAndSaveExam: () => Promise<void>;
  closeActiveSession: () => void;
  togglePauseSession: () => void;
  toggleFlagQuestion: (questionId: string) => void;
  setExamPhase: (phase: ExamPhase) => void;
  skipExamBreak: () => void;
  lockCurrentModuleAndAdvance: () => Promise<void>;
  setDraftAnswer: (questionId: string, draft: string) => void;
  submitAnswer: (question: Question) => Promise<Attempt | null>;
  goToQuestionIndex: (index: number) => void;
  completeSession: () => Promise<void>;
  syncSessionTime: (
    totalDeltaMs: number,
    questionId: string | null,
    questionDeltaMs: number
  ) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [taxonomy, setTaxonomy] = useState<TaxonomyData | null>(null);
  const [metas, setMetas] = useState<QuestionMeta[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [isOfflineFallback, setIsOfflineFallback] = useState<boolean>(false);
  const [offlineWarning, setOfflineWarning] = useState<string | null>(null);

  // Hydrate user preferences after mount to prevent SSR/client hydration mismatch
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const settingsRef = useRef<UserSettings>(DEFAULT_USER_SETTINGS);

  const [homeTab, setHomeTab] = useState<HomePracticeTab>('topic');
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [savedResumeExam, setSavedResumeExam] = useState<Session | null>(null);
  const [isTransitioningExamModule, setIsTransitioningExamModule] =
    useState<boolean>(false);
  const [isSessionSummaryView, setIsSessionSummaryView] =
    useState<boolean>(false);
  const activeSessionRef = useRef<Session | null>(null);
  const handledSharedQuestionRef = useRef<string | null>(null);
  const isTransitioningModuleRef = useRef<boolean>(false);
  const lastExamSaveMsRef = useRef<number>(0);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  // Restore any interrupted Full Exam snapshot from IndexedDB on boot
  useEffect(() => {
    loadActiveExamSession()
      .then((saved) => {
        if (saved && !activeSessionRef.current) {
          setSavedResumeExam(saved);
          setHomeTab('full');
        }
      })
      .catch(() => {});
  }, []);

  // Guard accidental tab close during an active unfinished Full Exam and flush snapshot
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      activeSession?.mode !== 'exam' ||
      activeSession.completedAt
    ) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (activeSessionRef.current) {
        saveActiveExamSession(activeSessionRef.current).catch(() => {});
      }
      e.preventDefault();
      e.returnValue = '';
    };

    const handlePageHide = () => {
      if (activeSessionRef.current?.mode === 'exam' && !activeSessionRef.current.completedAt) {
        saveActiveExamSession(activeSessionRef.current).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [activeSession?.id, activeSession?.mode, activeSession?.completedAt]);

  const examStructuralSig = useMemo(() => {
    if (!activeSession || activeSession.mode !== 'exam' || !activeSession.exam) {
      return '';
    }
    const drafts = activeSession.questionIds
      .map((id) => activeSession.questionStates[id]?.draftAnswer || '')
      .join('\u0001');
    return [
      activeSession.id,
      activeSession.currentIndex,
      activeSession.exam.phase,
      activeSession.exam.currentModuleIndex,
      activeSession.exam.isExamPaused ? '1' : '0',
      activeSession.exam.flaggedQuestionIds.join(','),
      drafts,
    ].join('|');
  }, [activeSession]);

  // Persist immediately when exam structure/answers change; throttle pure timer ticks to 3s
  useEffect(() => {
    if (!activeSession || activeSession.mode !== 'exam' || activeSession.completedAt) {
      return;
    }
    lastExamSaveMsRef.current = Date.now();
    saveActiveExamSession(activeSession).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examStructuralSig]);

  useEffect(() => {
    if (!activeSession || activeSession.mode !== 'exam' || activeSession.completedAt) {
      return;
    }
    const now = Date.now();
    if (now - lastExamSaveMsRef.current >= 3000) {
      lastExamSaveMsRef.current = now;
      saveActiveExamSession(activeSession).catch(() => {});
    }
  }, [activeSession]);

  useEffect(() => {
    const saved = loadUserSettings();
    settingsRef.current = saved;
    soundEngine.setSettings(saved);
    setSettings(saved);
  }, []);

  const metaMap = useMemo(() => {
    return new Map(metas.map((m) => [m.id, m]));
  }, [metas]);

  const reloadCatalog = useCallback(async (forceRefresh = false) => {
    setIsCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await initializeCatalog(forceRefresh);
      setTaxonomy(res.taxonomy);
      setMetas(res.metas);
      setIsOfflineFallback(res.isOfflineFallback);
      setOfflineWarning(res.errorWarning || null);
    } catch (err) {
      setCatalogError(
        err instanceof Error
          ? err.message
          : 'Unable to load SAT Question Bank. Please check your connection and try again.'
      );
    } finally {
      setIsCatalogLoading(false);
    }
  }, []);

  // Initial boot: load catalog (session history remains anonymous in memory)
  useEffect(() => {
    reloadCatalog(false);
  }, [reloadCatalog]);

  useEffect(() => {
    settingsRef.current = settings;
    soundEngine.setSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<UserSettings>) => {
    const next = { ...settingsRef.current, ...partial };
    settingsRef.current = next;
    soundEngine.setSettings(next);
    saveUserSettings(next);
    setSettings(next);
  }, []);

  const startPracticeSession = useCallback(
    async (
      filters: PracticeFilters,
      mode: PracticeMode,
      title: string,
      explicitQuestionIds?: string[]
    ): Promise<Session> => {
      let questionIds: string[] = [];

      if (explicitQuestionIds && explicitQuestionIds.length > 0) {
        questionIds = explicitQuestionIds;
      } else {
        const selectedMetas = await selectQuestionsForSession(metas, filters);
        questionIds = selectedMetas.map((m) => m.id);
      }

      if (questionIds.length === 0) {
        throw new Error(
          'No questions match your selected filters. Try broadening your selection.'
        );
      }

      const questionStates: Record<string, SessionQuestionState> = {};
      questionIds.forEach((qId, idx) => {
        questionStates[qId] = {
          questionId: qId,
          draftAnswer: '',
          isSubmitted: false,
          timeSpent: 0,
          visited: idx === 0,
        };
      });

      const newSession: Session = {
        id: generateId(),
        subject: filters.subject,
        mode,
        title,
        filters: {
          ...filters,
          questionCount: questionIds.length,
        },
        questionIds,
        currentIndex: 0,
        maxVisitedIndex: 0,
        questionStates,
        startedAt: Date.now(),
        totalTime: 0,
        isPaused: false,
      };

      setActiveSession(newSession);
      setIsSessionSummaryView(false);

      // Prefetch first few questions in background
      prefetchQuestions(questionIds.slice(0, 4));

      return newSession;
    },
    [metas]
  );

  // Automatically open a shared question link (?question=<id>) inside our app
  useEffect(() => {
    if (typeof window === 'undefined' || metas.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const sharedQId = params.get('question')?.trim();
    if (!sharedQId || handledSharedQuestionRef.current === sharedQId) return;

    handledSharedQuestionRef.current = sharedQId;

    const targetMeta = metas.find(
      (m) => m.id.toLowerCase() === sharedQId.toLowerCase()
    );
    const resolvedId = targetMeta ? targetMeta.id : sharedQId;
    const subject = targetMeta?.subject || 'math';
    const domain = targetMeta?.domain ? [targetMeta.domain] : [];
    const skill = targetMeta?.skill ? [targetMeta.skill] : [];
    const title = targetMeta?.skillLabel || `Question ${resolvedId}`;

    // Build a continuous queue starting with the shared question followed by related questions
    const relatedIds = targetMeta
      ? metas
          .filter(
            (m) =>
              m.subject === targetMeta.subject &&
              m.skill === targetMeta.skill &&
              m.id !== resolvedId
          )
          .map((m) => m.id)
      : [];

    startPracticeSession(
      {
        subject,
        domains: domain,
        skills: skill,
        difficulties: ['E', 'M', 'H'],
        difficulty: 'ALL',
      },
      'custom',
      title,
      [resolvedId, ...relatedIds]
    ).catch(() => {});
  }, [metas, startPracticeSession]);

  const startFullExam = useCallback(
    async (track: ExamTrack): Promise<Session> => {
      const seenIds = await getSeenExamQuestionIds();
      const initialModules = buildInitialExamModules({
        metas,
        track,
        seenIds,
      });

      const firstModule = initialModules[0];
      if (!firstModule || firstModule.questionIds.length === 0) {
        throw new Error(
          'Unable to assemble Full Practice exam from the question bank.'
        );
      }

      addSeenExamQuestionIds(firstModule.questionIds).catch(() => {});

      const questionStates: Record<string, SessionQuestionState> = {};
      firstModule.questionIds.forEach((qId, idx) => {
        questionStates[qId] = {
          questionId: qId,
          draftAnswer: '',
          isSubmitted: false,
          timeSpent: 0,
          visited: idx === 0,
        };
      });

      const titleMap: Record<ExamTrack, string> = {
        full: 'Full Digital SAT Practice',
        rw: 'Only Reading & Writing Full Practice',
        math: 'Only Math Full Practice',
      };

      const newSession: Session = {
        id: generateId(),
        subject: firstModule.subject,
        mode: 'exam',
        title: titleMap[track],
        filters: {
          subject: firstModule.subject,
          domains: [],
          skills: [],
          difficulties: ['E', 'M', 'H'],
          difficulty: 'ALL',
          questionCount: firstModule.questionIds.length,
        },
        questionIds: firstModule.questionIds,
        currentIndex: 0,
        maxVisitedIndex: 0,
        questionStates,
        startedAt: Date.now(),
        totalTime: 0,
        isPaused: false,
        exam: {
          track,
          phase: 'testing',
          currentModuleIndex: 0,
          modules: initialModules,
          flaggedQuestionIds: [],
          breakTimeRemainingMs: EXAM_BREAK_TIME_MS,
          isExamPaused: false,
        },
      };

      setSavedResumeExam(null);
      setActiveSession(newSession);
      setIsSessionSummaryView(false);
      await saveActiveExamSession(newSession);

      prefetchQuestions(firstModule.questionIds.slice(0, 4));
      return newSession;
    },
    [metas]
  );

  const resumeSavedExam = useCallback(() => {
    if (!savedResumeExam || !savedResumeExam.exam) return;
    const resumed: Session = {
      ...savedResumeExam,
      isPaused: false,
      exam: {
        ...savedResumeExam.exam,
        isExamPaused: false,
      },
    };
    setSavedResumeExam(null);
    setActiveSession(resumed);
    setIsSessionSummaryView(false);
    const idx = resumed.currentIndex || 0;
    prefetchQuestions(resumed.questionIds.slice(idx, idx + 4));
  }, [savedResumeExam]);

  const discardSavedExam = useCallback(async () => {
    await clearActiveExamSession();
    setSavedResumeExam(null);
  }, []);

  const exitAndSaveExam = useCallback(async () => {
    const cur = activeSessionRef.current;
    if (!cur || cur.mode !== 'exam' || !cur.exam || cur.completedAt) {
      setActiveSession(null);
      setIsSessionSummaryView(false);
      return;
    }
    const pausedSnapshot: Session = {
      ...cur,
      isPaused: true,
      exam: {
        ...cur.exam,
        isExamPaused: true,
      },
    };
    await saveActiveExamSession(pausedSnapshot);
    setSavedResumeExam(pausedSnapshot);
    setHomeTab('full');
    setActiveSession(null);
    setIsSessionSummaryView(false);
  }, []);

  const closeActiveSession = useCallback(() => {
    const cur = activeSessionRef.current;
    if (cur?.mode === 'exam' && cur.completedAt) {
      clearActiveExamSession().catch(() => {});
      setSavedResumeExam(null);
    }
    setActiveSession(null);
    setIsSessionSummaryView(false);
    if (typeof window !== 'undefined' && window.location.search) {
      const url = new URL(window.location.href);
      if (url.searchParams.has('question')) {
        url.searchParams.delete('question');
        const nextSearch = url.searchParams.toString();
        window.history.replaceState(
          {},
          '',
          `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}`
        );
      }
    }
  }, []);

  const togglePauseSession = useCallback(() => {
    setActiveSession((prev) => {
      if (!prev || prev.completedAt) return prev;
      const nextPaused = !prev.isPaused;
      return {
        ...prev,
        isPaused: nextPaused,
        exam: prev.exam
          ? {
              ...prev.exam,
              isExamPaused: nextPaused,
            }
          : undefined,
      };
    });
  }, []);

  const toggleFlagQuestion = useCallback((questionId: string) => {
    setActiveSession((prev) => {
      if (!prev || prev.mode !== 'exam' || !prev.exam || prev.completedAt) {
        return prev;
      }
      const existing = prev.exam.flaggedQuestionIds;
      const nextFlagged = existing.includes(questionId)
        ? existing.filter((id) => id !== questionId)
        : [...existing, questionId];
      return {
        ...prev,
        exam: {
          ...prev.exam,
          flaggedQuestionIds: nextFlagged,
        },
      };
    });
  }, []);

  const setExamPhase = useCallback((phase: ExamPhase) => {
    setActiveSession((prev) => {
      if (!prev || prev.mode !== 'exam' || !prev.exam || prev.completedAt) {
        return prev;
      }
      return {
        ...prev,
        exam: {
          ...prev.exam,
          phase,
        },
      };
    });
  }, []);

  const skipExamBreak = useCallback(() => {
    setActiveSession((prev) => {
      if (!prev || prev.mode !== 'exam' || !prev.exam || prev.completedAt) {
        return prev;
      }
      return {
        ...prev,
        isPaused: false,
        exam: {
          ...prev.exam,
          phase: 'testing',
          breakTimeRemainingMs: 0,
          isExamPaused: false,
        },
      };
    });
  }, []);

  const lockCurrentModuleAndAdvance = useCallback(async () => {
    if (isTransitioningModuleRef.current) return;
    const currentSess = activeSessionRef.current;
    if (
      !currentSess ||
      currentSess.mode !== 'exam' ||
      !currentSess.exam ||
      currentSess.completedAt
    ) {
      return;
    }

    const activeExam = currentSess.exam;
    const currentMod = activeExam.modules[activeExam.currentModuleIndex];
    if (!currentMod || currentMod.locked) return;

    isTransitioningModuleRef.current = true;
    setIsTransitioningExamModule(true);

    try {
      // Grade all items in the active module silently
      const answeredIds = currentMod.questionIds.filter((qId) => {
        const draft = currentSess.questionStates[qId]?.draftAnswer.trim();
        return Boolean(draft);
      });

      const fetchedQuestions = await Promise.all(
        answeredIds.map((qId) => fetchQuestionDetail(qId).catch(() => null))
      );
      const qDetailMap = new Map<string, Question>();
      fetchedQuestions.forEach((q) => {
        if (q) qDetailMap.set(q.id, q);
      });

      const nextStates: Record<string, SessionQuestionState> = {
        ...currentSess.questionStates,
      };
      let rawCorrectCount = 0;

      for (const qId of currentMod.questionIds) {
        const prevSt = nextStates[qId] || {
          questionId: qId,
          draftAnswer: '',
          isSubmitted: false,
          timeSpent: 0,
          visited: false,
        };
        const draft = prevSt.draftAnswer.trim();
        const detail = qDetailMap.get(qId);
        const isCorrect =
          Boolean(draft) && Boolean(detail)
            ? evaluateAnswer(detail!, draft)
            : false;

        if (isCorrect) {
          rawCorrectCount += 1;
        }

        nextStates[qId] = {
          ...prevSt,
          submittedAnswer: draft,
          isSubmitted: true,
          isCorrect,
        };
      }

      const lockedCurrentMod = {
        ...currentMod,
        locked: true,
        submittedAt: Date.now(),
        rawCorrectCount,
        totalCount: currentMod.questionIds.length,
      };

      const updatedModules = activeExam.modules.map((m, idx) =>
        idx === activeExam.currentModuleIndex ? lockedCurrentMod : m
      );

      const alreadyUsedIds = updatedModules.flatMap((m) => m.questionIds);
      const seenIds = await getSeenExamQuestionIds();

      // Case 1: Module 1 -> build Adaptive Module 2
      if (currentMod.moduleNumber === 1) {
        const nextTier = determineModule2Tier(
          lockedCurrentMod,
          nextStates,
          metaMap
        );
        const module2 = buildExamModule({
          metas,
          subject: currentMod.subject,
          moduleNumber: 2,
          tier: nextTier,
          seenIds,
          excludeIds: alreadyUsedIds,
        });
        addSeenExamQuestionIds(module2.questionIds).catch(() => {});

        module2.questionIds.forEach((qId, idx) => {
          nextStates[qId] = {
            questionId: qId,
            draftAnswer: '',
            isSubmitted: false,
            timeSpent: 0,
            visited: idx === 0,
          };
        });

        const nextSession: Session = {
          ...currentSess,
          subject: module2.subject,
          questionIds: module2.questionIds,
          currentIndex: 0,
          maxVisitedIndex: 0,
          questionStates: nextStates,
          isPaused: false,
          exam: {
            ...activeExam,
            phase: 'testing',
            currentModuleIndex: activeExam.currentModuleIndex + 1,
            modules: [...updatedModules, module2],
            flaggedQuestionIds: [],
            isExamPaused: false,
          },
        };

        await saveActiveExamSession(nextSession);
        setActiveSession(nextSession);
        prefetchQuestions(module2.questionIds.slice(0, 4));
        return;
      }

      // Case 2: R&W Module 2 on Full Test -> Build Math M1 & enter 10-min Break
      if (currentMod.subject === 'rw' && activeExam.track === 'full') {
        const mathModule1 = buildExamModule({
          metas,
          subject: 'math',
          moduleNumber: 1,
          tier: 'baseline',
          seenIds,
          excludeIds: alreadyUsedIds,
        });
        addSeenExamQuestionIds(mathModule1.questionIds).catch(() => {});

        mathModule1.questionIds.forEach((qId, idx) => {
          nextStates[qId] = {
            questionId: qId,
            draftAnswer: '',
            isSubmitted: false,
            timeSpent: 0,
            visited: idx === 0,
          };
        });

        const nextSession: Session = {
          ...currentSess,
          subject: 'math',
          questionIds: mathModule1.questionIds,
          currentIndex: 0,
          maxVisitedIndex: 0,
          questionStates: nextStates,
          isPaused: false,
          exam: {
            ...activeExam,
            phase: 'break',
            currentModuleIndex: activeExam.currentModuleIndex + 1,
            modules: [...updatedModules, mathModule1],
            flaggedQuestionIds: [],
            breakTimeRemainingMs: EXAM_BREAK_TIME_MS,
            isExamPaused: false,
          },
        };

        await saveActiveExamSession(nextSession);
        setActiveSession(nextSession);
        prefetchQuestions(mathModule1.questionIds.slice(0, 4));
        return;
      }

      // Case 3: Final Module Completed -> Compute Score Report & Open Summary
      const allExamQuestionIds = updatedModules.flatMap((m) => m.questionIds);
      const preliminaryCompleted: Session = {
        ...currentSess,
        questionIds: allExamQuestionIds,
        currentIndex: 0,
        maxVisitedIndex: Math.max(0, allExamQuestionIds.length - 1),
        questionStates: nextStates,
        completedAt: Date.now(),
        isPaused: true,
        exam: {
          ...activeExam,
          phase: 'completed',
          modules: updatedModules,
          flaggedQuestionIds: [],
          isExamPaused: true,
        },
      };

      const scoreReport = computeExamScoreReport(preliminaryCompleted, metaMap);
      const finalSession: Session = {
        ...preliminaryCompleted,
        exam: {
          ...preliminaryCompleted.exam!,
          scoreReport,
        },
      };

      await clearActiveExamSession();
      setSavedResumeExam(null);
      soundEngine.play('complete');
      setActiveSession(finalSession);
      setIsSessionSummaryView(true);
    } finally {
      isTransitioningModuleRef.current = false;
      setIsTransitioningExamModule(false);
    }
  }, [metaMap, metas]);

  const setDraftAnswer = useCallback((questionId: string, draft: string) => {
    setActiveSession((prev) => {
      if (!prev) return prev;
      const qState = prev.questionStates[questionId];
      if (!qState || qState.isSubmitted) return prev;

      return {
        ...prev,
        questionStates: {
          ...prev.questionStates,
          [questionId]: {
            ...qState,
            draftAnswer: draft,
          },
        },
      };
    });
  }, []);

  const submitAnswer = useCallback(
    async (question: Question): Promise<Attempt | null> => {
      const currentSess = activeSessionRef.current;
      if (!currentSess || currentSess.mode === 'exam') return null;

      const qState = currentSess.questionStates[question.id];
      if (!qState || qState.isSubmitted) return null;

      const selectedAnswer = qState.draftAnswer.trim();
      if (!selectedAnswer) return null;

      const isCorrect = evaluateAnswer(question, selectedAnswer);
      soundEngine.play(isCorrect ? 'correct' : 'incorrect');

      const attempt: Attempt = {
        id: generateId(),
        questionId: question.id,
        sessionId: currentSess.id,
        selectedAnswer,
        correctAnswer: question.correctAnswer,
        isCorrect,
        timeSpent: qState.timeSpent,
        timestamp: Date.now(),
        subject: question.subject,
        domain: question.domain,
        skill: question.skill,
        difficulty: question.difficulty,
      };

      const updatedSession: Session = {
        ...currentSess,
        questionStates: {
          ...currentSess.questionStates,
          [question.id]: {
            ...qState,
            submittedAnswer: selectedAnswer,
            isSubmitted: true,
            isCorrect,
            attemptId: attempt.id,
          },
        },
      };

      setActiveSession(updatedSession);
      return attempt;
    },
    []
  );

  const goToQuestionIndex = useCallback((index: number) => {
    setActiveSession((prev) => {
      if (!prev) return prev;
      const clamped = Math.max(0, Math.min(prev.questionIds.length - 1, index));

      const isLeavingReview =
        prev.mode === 'exam' &&
        !prev.completedAt &&
        prev.exam?.phase === 'module-review';

      if (clamped === prev.currentIndex && !isLeavingReview) return prev;

      const targetQId = prev.questionIds[clamped];
      const nextStates =
        targetQId && prev.questionStates[targetQId]
          ? {
              ...prev.questionStates,
              [targetQId]: {
                ...prev.questionStates[targetQId],
                visited: true,
              },
            }
          : prev.questionStates;

      // Prefetch upcoming questions
      prefetchQuestions(prev.questionIds.slice(clamped, clamped + 4));

      return {
        ...prev,
        currentIndex: clamped,
        maxVisitedIndex: Math.max(prev.maxVisitedIndex ?? prev.currentIndex, clamped),
        questionStates: nextStates,
        exam:
          isLeavingReview && prev.exam
            ? { ...prev.exam, phase: 'testing' }
            : prev.exam,
      };
    });
  }, []);

  const completeSession = useCallback(async () => {
    const currentSess = activeSessionRef.current;
    if (!currentSess) return;

    if (currentSess.mode === 'exam' && !currentSess.completedAt) {
      await lockCurrentModuleAndAdvance();
      return;
    }

    soundEngine.play('complete');

    const completed: Session = {
      ...currentSess,
      completedAt: currentSess.completedAt || Date.now(),
      isPaused: true,
    };

    setActiveSession(completed);
    setIsSessionSummaryView(true);
  }, [lockCurrentModuleAndAdvance]);

  const syncSessionTime = useCallback(
    (
      totalDeltaMs: number,
      questionId: string | null,
      questionDeltaMs: number
    ) => {
      setActiveSession((prev) => {
        if (!prev || prev.isPaused || prev.completedAt) return prev;

        if (prev.mode === 'exam' && prev.exam) {
          if (prev.exam.isExamPaused || prev.exam.phase === 'completed') {
            return prev;
          }

          if (prev.exam.phase === 'break') {
            const nextBreak = Math.max(
              0,
              prev.exam.breakTimeRemainingMs - totalDeltaMs
            );
            return {
              ...prev,
              exam: {
                ...prev.exam,
                breakTimeRemainingMs: nextBreak,
              },
            };
          }

          const modIdx = prev.exam.currentModuleIndex;
          const activeMod = prev.exam.modules[modIdx];
          if (!activeMod || activeMod.locked) return prev;

          const nextStates = { ...prev.questionStates };
          if (questionId && nextStates[questionId]) {
            nextStates[questionId] = {
              ...nextStates[questionId],
              timeSpent: nextStates[questionId].timeSpent + questionDeltaMs,
            };
          }

          const nextRemaining = Math.max(
            0,
            activeMod.timeRemainingMs - totalDeltaMs
          );
          const nextModules = prev.exam.modules.map((m, idx) =>
            idx === modIdx ? { ...m, timeRemainingMs: nextRemaining } : m
          );

          return {
            ...prev,
            totalTime: prev.totalTime + totalDeltaMs,
            questionStates: nextStates,
            exam: {
              ...prev.exam,
              modules: nextModules,
            },
          };
        }

        const nextStates = { ...prev.questionStates };
        if (questionId && nextStates[questionId]) {
          nextStates[questionId] = {
            ...nextStates[questionId],
            timeSpent: nextStates[questionId].timeSpent + questionDeltaMs,
          };
        }

        return {
          ...prev,
          totalTime: prev.totalTime + totalDeltaMs,
          questionStates: nextStates,
        };
      });
    },
    []
  );

  const value = useMemo<AppContextValue>(
    () => ({
      taxonomy,
      metas,
      metaMap,
      isCatalogLoading,
      catalogError,
      isOfflineFallback,
      offlineWarning,
      reloadCatalog,
      settings,
      updateSettings,
      homeTab,
      setHomeTab,
      activeSession,
      savedResumeExam,
      isTransitioningExamModule,
      isSessionSummaryView,
      setIsSessionSummaryView,
      startPracticeSession,
      startFullExam,
      resumeSavedExam,
      discardSavedExam,
      exitAndSaveExam,
      closeActiveSession,
      togglePauseSession,
      toggleFlagQuestion,
      setExamPhase,
      skipExamBreak,
      lockCurrentModuleAndAdvance,
      setDraftAnswer,
      submitAnswer,
      goToQuestionIndex,
      completeSession,
      syncSessionTime,
    }),
    [
      taxonomy,
      metas,
      metaMap,
      isCatalogLoading,
      catalogError,
      isOfflineFallback,
      offlineWarning,
      reloadCatalog,
      settings,
      updateSettings,
      homeTab,
      setHomeTab,
      activeSession,
      savedResumeExam,
      isTransitioningExamModule,
      isSessionSummaryView,
      startPracticeSession,
      startFullExam,
      resumeSavedExam,
      discardSavedExam,
      exitAndSaveExam,
      closeActiveSession,
      togglePauseSession,
      toggleFlagQuestion,
      setExamPhase,
      skipExamBreak,
      lockCurrentModuleAndAdvance,
      setDraftAnswer,
      submitAnswer,
      goToQuestionIndex,
      completeSession,
      syncSessionTime,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return ctx;
}
