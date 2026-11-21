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
  PassageHighlight,
  PracticeFilters,
  PracticeMode,
  Question,
  QuestionMeta,
  ScratchpadStroke,
  Session,
  SessionQuestionState,
  TaxonomyData,
  UserSettings,
} from '@/types';
import {
  DEFAULT_USER_SETTINGS,
  loadPersistedActiveSession,
  loadUserSettings,
  savePersistedActiveSession,
  saveUserSettings,
} from '@/services/storage/preferences';
import {
  evaluateAnswer,
  initializeCatalog,
  prefetchQuestions,
  selectQuestionsForSession,
} from '@/services/questionBank';
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

  // Wizard Navigation Reset
  wizardResetToken: number;
  triggerWizardReset: () => void;

  // Active Session & Stopwatch
  activeSession: Session | null;
  isSessionSummaryView: boolean;
  setIsSessionSummaryView: (val: boolean) => void;
  startPracticeSession: (
    filters: PracticeFilters,
    mode: PracticeMode,
    title: string,
    explicitQuestionIds?: string[]
  ) => Promise<Session>;
  closeActiveSession: () => void;
  togglePauseSession: () => void;
  setDraftAnswer: (questionId: string, draft: string) => void;
  setQuestionHighlights: (
    questionId: string,
    highlights: PassageHighlight[]
  ) => void;
  setQuestionEliminated: (questionId: string, eliminated: string[]) => void;
  setQuestionScratchpad: (
    questionId: string,
    strokes: ScratchpadStroke[]
  ) => void;
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

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isSessionSummaryView, setIsSessionSummaryView] =
    useState<boolean>(false);
  const [wizardResetToken, setWizardResetToken] = useState<number>(0);
  const activeSessionRef = useRef<Session | null>(null);
  const handledSharedQuestionRef = useRef<string | null>(null);
  const hasHydratedSessionRef = useRef<boolean>(false);
  const [isPendingSharedQuestion, setIsPendingSharedQuestion] =
    useState<boolean>(false);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    const saved = loadUserSettings();
    settingsRef.current = saved;
    soundEngine.setSettings(saved);
    setSettings(saved);

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const sharedQId = params.get('question')?.trim();
      if (sharedQId) {
        setIsPendingSharedQuestion(true);
      } else {
        const persisted = loadPersistedActiveSession();
        if (persisted) {
          activeSessionRef.current = persisted.session;
          setActiveSession(persisted.session);
          setIsSessionSummaryView(persisted.isSessionSummaryView);
        }
      }
    }
    hasHydratedSessionRef.current = true;
  }, []);

  useEffect(() => {
    if (!hasHydratedSessionRef.current) return;
    if (!activeSession) {
      savePersistedActiveSession(null);
    } else {
      savePersistedActiveSession({
        session: activeSession,
        isSessionSummaryView,
      });
    }
  }, [activeSession, isSessionSummaryView]);

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
        highlightsByQuestion: {},
        eliminatedByQuestion: {},
        scratchpadByQuestion: {},
        startedAt: Date.now(),
        totalTime: 0,
        isPaused: false,
      };

      activeSessionRef.current = newSession;
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
    if (typeof window === 'undefined') return;
    if (catalogError) {
      setIsPendingSharedQuestion(false);
      return;
    }
    if (metas.length === 0) return;

    const params = new URLSearchParams(window.location.search);
    const sharedQId = params.get('question')?.trim();
    if (!sharedQId || handledSharedQuestionRef.current === sharedQId) {
      setIsPendingSharedQuestion(false);
      return;
    }

    handledSharedQuestionRef.current = sharedQId;
    const lowId = sharedQId.toLowerCase();

    const targetMeta = metas.find(
      (m) =>
        m.id.toLowerCase() === lowId ||
        m.questionId.toLowerCase() === lowId ||
        m.uId.toLowerCase() === lowId ||
        (m.externalId && m.externalId.toLowerCase() === lowId) ||
        (m.ibn && m.ibn.toLowerCase() === lowId)
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
    )
      .catch(() => {})
      .finally(() => {
        setIsPendingSharedQuestion(false);
      });
  }, [metas, catalogError, startPracticeSession]);

  const closeActiveSession = useCallback(() => {
    activeSessionRef.current = null;
    setActiveSession(null);
    setIsSessionSummaryView(false);
    savePersistedActiveSession(null);
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
      const next: Session = {
        ...prev,
        isPaused: !prev.isPaused,
      };
      activeSessionRef.current = next;
      return next;
    });
  }, []);

  const setDraftAnswer = useCallback((questionId: string, draft: string) => {
    setActiveSession((prev) => {
      if (!prev || prev.completedAt) return prev;
      const qState = prev.questionStates[questionId];
      if (!qState || qState.isSubmitted) return prev;

      const next: Session = {
        ...prev,
        questionStates: {
          ...prev.questionStates,
          [questionId]: {
            ...qState,
            draftAnswer: draft,
          },
        },
      };
      activeSessionRef.current = next;
      return next;
    });
  }, []);

  const setQuestionHighlights = useCallback(
    (questionId: string, highlights: PassageHighlight[]) => {
      setActiveSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          highlightsByQuestion: {
            ...(prev.highlightsByQuestion || {}),
            [questionId]: highlights,
          },
        };
      });
    },
    []
  );

  const setQuestionEliminated = useCallback(
    (questionId: string, eliminated: string[]) => {
      setActiveSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          eliminatedByQuestion: {
            ...(prev.eliminatedByQuestion || {}),
            [questionId]: eliminated,
          },
        };
      });
    },
    []
  );

  const setQuestionScratchpad = useCallback(
    (questionId: string, strokes: ScratchpadStroke[]) => {
      setActiveSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scratchpadByQuestion: {
            ...(prev.scratchpadByQuestion || {}),
            [questionId]: strokes,
          },
        };
      });
    },
    []
  );

  const submitAnswer = useCallback(
    async (question: Question): Promise<Attempt | null> => {
      const currentSess = activeSessionRef.current;
      if (!currentSess || currentSess.completedAt) return null;

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
            correctAnswer: question.correctAnswer,
            isSubmitted: true,
            isCorrect,
            attemptId: attempt.id,
          },
        },
      };

      activeSessionRef.current = updatedSession;
      setActiveSession(updatedSession);
      return attempt;
    },
    []
  );

  const goToQuestionIndex = useCallback((index: number) => {
    setActiveSession((prev) => {
      if (!prev) return prev;
      const clamped = Math.max(0, Math.min(prev.questionIds.length - 1, index));
      if (clamped === prev.currentIndex) return prev;

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

      const next: Session = {
        ...prev,
        currentIndex: clamped,
        maxVisitedIndex: Math.max(prev.maxVisitedIndex ?? prev.currentIndex, clamped),
        questionStates: nextStates,
      };
      activeSessionRef.current = next;
      return next;
    });
  }, []);

  const completeSession = useCallback(async () => {
    const currentSess = activeSessionRef.current;
    if (!currentSess) return;

    soundEngine.play('complete');

    const maxVisitedIdx = Math.max(
      currentSess.currentIndex,
      currentSess.maxVisitedIndex ?? 0
    );

    const activeQuestionIds = currentSess.questionIds.filter((qId, idx) => {
      const st = currentSess.questionStates[qId];
      return (
        idx === 0 ||
        idx <= maxVisitedIdx ||
        Boolean(st?.visited) ||
        Boolean(st?.isSubmitted) ||
        Boolean(st?.draftAnswer)
      );
    });

    const trimmedIds =
      activeQuestionIds.length > 0
        ? activeQuestionIds
        : currentSess.questionIds.slice(0, 1);
    const clampedIdx = Math.min(
      currentSess.currentIndex,
      Math.max(0, trimmedIds.length - 1)
    );

    const completed: Session = {
      ...currentSess,
      questionIds: trimmedIds,
      currentIndex: clampedIdx,
      maxVisitedIndex: trimmedIds.length - 1,
      completedAt: currentSess.completedAt || Date.now(),
      isPaused: true,
    };

    activeSessionRef.current = completed;
    setActiveSession(completed);
    setIsSessionSummaryView(true);
  }, []);

  const syncSessionTime = useCallback(
    (
      totalDeltaMs: number,
      questionId: string | null,
      questionDeltaMs: number
    ) => {
      setActiveSession((prev) => {
        if (!prev || prev.isPaused || prev.completedAt) return prev;

        const nextStates = { ...prev.questionStates };
        if (questionId && nextStates[questionId]) {
          nextStates[questionId] = {
            ...nextStates[questionId],
            timeSpent: nextStates[questionId].timeSpent + questionDeltaMs,
          };
        }

        const next: Session = {
          ...prev,
          totalTime: prev.totalTime + totalDeltaMs,
          questionStates: nextStates,
        };
        activeSessionRef.current = next;
        return next;
      });
    },
    []
  );

  const triggerWizardReset = useCallback(() => {
    setWizardResetToken((prev) => prev + 1);
  }, []);

  const effectiveIsCatalogLoading = isCatalogLoading || isPendingSharedQuestion;

  const value = useMemo<AppContextValue>(
    () => ({
      taxonomy,
      metas,
      metaMap,
      isCatalogLoading: effectiveIsCatalogLoading,
      catalogError,
      isOfflineFallback,
      offlineWarning,
      reloadCatalog,
      settings,
      updateSettings,
      wizardResetToken,
      triggerWizardReset,
      activeSession,
      isSessionSummaryView,
      setIsSessionSummaryView,
      startPracticeSession,
      closeActiveSession,
      togglePauseSession,
      setDraftAnswer,
      setQuestionHighlights,
      setQuestionEliminated,
      setQuestionScratchpad,
      submitAnswer,
      goToQuestionIndex,
      completeSession,
      syncSessionTime,
    }),
    [
      taxonomy,
      metas,
      metaMap,
      effectiveIsCatalogLoading,
      catalogError,
      isOfflineFallback,
      offlineWarning,
      reloadCatalog,
      settings,
      updateSettings,
      wizardResetToken,
      triggerWizardReset,
      activeSession,
      isSessionSummaryView,
      startPracticeSession,
      closeActiveSession,
      togglePauseSession,
      setDraftAnswer,
      setQuestionHighlights,
      setQuestionEliminated,
      setQuestionScratchpad,
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
