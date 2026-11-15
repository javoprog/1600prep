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
  const activeSessionRef = useRef<Session | null>(null);
  const handledSharedQuestionRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
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

  const closeActiveSession = useCallback(() => {
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
      return {
        ...prev,
        isPaused: !prev.isPaused,
      };
    });
  }, []);

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
      if (!currentSess) return null;

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

      return {
        ...prev,
        currentIndex: clamped,
        maxVisitedIndex: Math.max(prev.maxVisitedIndex ?? prev.currentIndex, clamped),
        questionStates: nextStates,
      };
    });
  }, []);

  const completeSession = useCallback(async () => {
    const currentSess = activeSessionRef.current;
    if (!currentSess) return;

    soundEngine.play('complete');

    const completed: Session = {
      ...currentSess,
      completedAt: currentSess.completedAt || Date.now(),
      isPaused: true,
    };

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
      activeSession,
      isSessionSummaryView,
      setIsSessionSummaryView,
      startPracticeSession,
      closeActiveSession,
      togglePauseSession,
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
      activeSession,
      isSessionSummaryView,
      startPracticeSession,
      closeActiveSession,
      togglePauseSession,
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
