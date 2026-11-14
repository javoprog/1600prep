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
  Bookmark,
  PracticeFilters,
  PracticeMode,
  Question,
  QuestionMeta,
  Session,
  SessionQuestionState,
  TaxonomyData,
  UserSettings,
} from '@/types';
import { DEFAULT_USER_SETTINGS } from '@/services/storage/preferences';
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
  reloadCatalog: () => Promise<void>;

  // Anonymous in-memory state (no user data persisted)
  settings: UserSettings;
  updateSettings: (partial: Partial<UserSettings>) => void;
  bookmarks: Bookmark[];
  bookmarkedIds: Set<string>;
  toggleBookmark: (
    questionId: string,
    meta?: Partial<QuestionMeta>
  ) => Promise<void>;
  attempts: Attempt[];
  sessions: Session[];
  refreshProgress: () => Promise<void>;
  clearProgress: () => Promise<void>;

  // Settings Modal (unused, kept for interface compatibility)
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;

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
  openExistingSession: (
    sessionId: string,
    openInSummary?: boolean
  ) => Promise<void>;
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

  // Purely in-memory settings (no user data persisted)
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_USER_SETTINGS);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isSessionSummaryView, setIsSessionSummaryView] =
    useState<boolean>(false);
  const activeSessionRef = useRef<Session | null>(null);
  const handledSharedQuestionRef = useRef<string | null>(null);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  const metaMap = useMemo(() => {
    return new Map(metas.map((m) => [m.id, m]));
  }, [metas]);

  const bookmarks = useMemo<Bookmark[]>(() => [], []);
  const bookmarkedIds = useMemo<Set<string>>(() => new Set(), []);
  const attempts = useMemo<Attempt[]>(() => [], []);
  const sessions = useMemo<Session[]>(() => [], []);

  const refreshProgress = useCallback(async () => {
    // No-op: anonymous mode does not collect or persist user progress
  }, []);

  const clearProgress = useCallback(async () => {
    setActiveSession(null);
    setIsSessionSummaryView(false);
  }, []);

  const toggleBookmark = useCallback(async () => {
    // No-op: bookmarks removed in anonymous mode
  }, []);

  const reloadCatalog = useCallback(async () => {
    setIsCatalogLoading(true);
    setCatalogError(null);
    try {
      const res = await initializeCatalog(false);
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

  // Initial boot: load catalog only (anonymous mode, no saved sessions or user data)
  useEffect(() => {
    reloadCatalog();
  }, [reloadCatalog]);

  const updateSettings = useCallback((partial: Partial<UserSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
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
      for (const qId of questionIds) {
        questionStates[qId] = {
          questionId: qId,
          draftAnswer: '',
          isSubmitted: false,
          timeSpent: 0,
        };
      }

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

  const openExistingSession = useCallback(async () => {
    // No-op in anonymous mode
  }, []);

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

      // Prefetch upcoming questions
      prefetchQuestions(prev.questionIds.slice(clamped, clamped + 4));

      return {
        ...prev,
        currentIndex: clamped,
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
      bookmarks,
      bookmarkedIds,
      toggleBookmark,
      attempts,
      sessions,
      refreshProgress,
      clearProgress,
      isSettingsOpen,
      setIsSettingsOpen,
      activeSession,
      isSessionSummaryView,
      setIsSessionSummaryView,
      startPracticeSession,
      openExistingSession,
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
      bookmarks,
      bookmarkedIds,
      toggleBookmark,
      attempts,
      sessions,
      refreshProgress,
      clearProgress,
      isSettingsOpen,
      activeSession,
      isSessionSummaryView,
      startPracticeSession,
      openExistingSession,
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
