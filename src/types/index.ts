export type SubjectCode = 'rw' | 'math';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'red';

export interface PassageHighlight {
  id: string;
  start: number;
  end: number;
  color: HighlightColor;
}

export interface ScratchpadPoint {
  x: number;
  y: number;
}

export interface ScratchpadStroke {
  tool: 'pen' | 'eraser';
  points: ScratchpadPoint[];
  width: number;
  color?: string;
  target?: 'overlay' | 'board';
  coordSpace?: 'norm' | 'center-px' | 'px';
}

export type DifficultyCode = 'E' | 'M' | 'H';
export type DifficultyFilter = DifficultyCode | 'ALL';

export type QuestionType = 'mcq' | 'spr';

export type PracticeMode =
  | 'custom'
  | 'mistakes'
  | 'retry';

export interface SkillTaxonomyItem {
  id: string;
  code: string;
  text: string;
  questionCount: number;
}

export interface DomainTaxonomyItem {
  id: string;
  primaryClassCd: string;
  text: string;
  subject: SubjectCode;
  skills: SkillTaxonomyItem[];
  questionCount: number;
}

export interface TaxonomyData {
  rw: DomainTaxonomyItem[];
  math: DomainTaxonomyItem[];
  fetchedAt: number;
}

export interface QuestionMeta {
  id: string; // normalized unique ID (questionId, e.g., "f1bfbed3")
  uId: string;
  questionId: string;
  externalId: string | null;
  ibn: string | null;
  subject: SubjectCode;
  subjectLabel: string;
  domain: string; // primary_class_cd, e.g., "INI", "H"
  domainLabel: string; // primary_class_cd_desc
  skill: string; // skill_cd, e.g., "INF", "H.A."
  skillLabel: string; // normalized skill_desc
  difficulty: DifficultyCode | null;
  scoreBand?: number;
  createDate?: number;
  updateDate?: number;
}

export interface AnswerOption {
  id: string;
  label: 'A' | 'B' | 'C' | 'D';
  content: string;
}

export interface Question extends QuestionMeta {
  questionType: QuestionType;
  questionContent: string; // HTML stem/prompt
  passage?: string; // HTML stimulus/body if present
  answerOptions?: AnswerOption[]; // present when questionType === 'mcq'
  correctAnswer: string[]; // e.g. ['B'] for MCQ, or ['3/2', '1.5'] for SPR
  explanation?: string; // HTML rationale if available
  images?: string[]; // extracted image sources or 'inline-svg' indicators
  cachedAt: number;
}

export interface Attempt {
  id: string;
  questionId: string;
  sessionId: string;
  selectedAnswer: string;
  correctAnswer: string[];
  isCorrect: boolean;
  timeSpent: number; // milliseconds spent on this attempt
  timestamp: number; // epoch ms
  subject: SubjectCode;
  domain: string;
  skill: string;
  difficulty: DifficultyCode | null;
}

export interface PracticeFilters {
  subject: SubjectCode;
  domains: string[]; // primaryClassCd list
  skills: string[]; // skill_cd list
  difficulties?: DifficultyCode[]; // multi-select difficulties ('E' | 'M' | 'H')
  difficulty?: DifficultyFilter;
  questionCount?: number; // 0 or undefined = All matching questions
}

export interface SessionQuestionState {
  questionId: string;
  draftAnswer: string;
  submittedAnswer?: string;
  correctAnswer?: string[];
  isSubmitted: boolean;
  isCorrect?: boolean;
  attemptId?: string;
  timeSpent: number; // milliseconds accumulated on this question in this session
  visited?: boolean;
}

export interface Session {
  id: string;
  subject: SubjectCode;
  mode: PracticeMode;
  title: string;
  filters: PracticeFilters;
  questionIds: string[];
  currentIndex: number;
  maxVisitedIndex?: number;
  questionStates: Record<string, SessionQuestionState>;
  highlightsByQuestion?: Record<string, PassageHighlight[]>;
  eliminatedByQuestion?: Record<string, string[]>;
  scratchpadByQuestion?: Record<string, ScratchpadStroke[]>;
  startedAt: number;
  completedAt?: number;
  totalTime: number; // milliseconds accumulated across the session
  isPaused: boolean;
}

export interface UserSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0 to 1
  defaultDifficulties: DifficultyCode[];
  defaultDifficulty: DifficultyFilter;
  defaultQuestionCount: number; // 0 = All (continuous), or fixed count (e.g. 5, 10, 20, 30)
}

export interface UserProfile {
  id: string;
  name: string;
  email: string | null;
  avatarUrl: string | null;
  hasPassword: boolean;
  googleConnected: boolean;
  googleEmail: string | null;
  telegramConnected: boolean;
  telegramId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  createdAt: string;
}

export interface AuthProviderConfig {
  googleEnabled: boolean;
  googleClientId: string | null;
  telegramBotEnabled: boolean;
  telegramWidgetEnabled: boolean;
  telegramBotUsername: string | null;
}

export interface SavedSessionItem {
  id: string;
  subject: SubjectCode;
  mode: PracticeMode;
  title: string;
  totalQuestions: number;
  answeredCount: number;
  correctCount: number;
  totalTime: number;
  startedAt: number;
  completedAt: number | null;
}

export interface SavedResultsSummary {
  totalAttempts: number;
  correctAttempts: number;
  accuracyPercent: number;
  uniqueQuestionsAttempted: number;
  uniqueQuestionsSolved: number;
  totalTimeMs: number;
  bySubject: {
    rw: { total: number; correct: number; accuracyPercent: number };
    math: { total: number; correct: number; accuracyPercent: number };
  };
  solvedQuestionIds: string[];
  mistakeQuestionIds: string[];
  recentSessions: SavedSessionItem[];
  recentAttempts: Attempt[];
}

