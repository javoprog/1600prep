export type SubjectCode = 'rw' | 'math';

export type DifficultyCode = 'E' | 'M' | 'H';
export type DifficultyFilter = DifficultyCode | 'ALL';

export type QuestionType = 'mcq' | 'spr';

export type RepetitionFilter =
  | 'all'
  | 'new'
  | 'previous'
  | 'incorrect'
  | 'bookmarked';

export type NewPreviousRatio = 100 | 75 | 50 | 25 | 0;

export type PracticeMode =
  | 'custom'
  | 'mistakes'
  | 'retry'
  | 'exam';

export type ExamTrack = 'full' | 'rw' | 'math';
export type ExamPhase = 'testing' | 'module-review' | 'break' | 'completed';
export type AdaptiveTier = 'baseline' | 'easy' | 'hard';

export interface ExamModuleState {
  id: string;
  subject: SubjectCode;
  moduleNumber: 1 | 2;
  label: string;
  shortLabel: string;
  tier: AdaptiveTier;
  timeLimitMs: number;
  timeRemainingMs: number;
  questionIds: string[];
  locked: boolean;
  submittedAt?: number;
  rawCorrectCount?: number;
  totalCount?: number;
}

export interface DomainScoreBreakdown {
  domain: string;
  domainLabel: string;
  subject: SubjectCode;
  correct: number;
  total: number;
}

export interface SectionScorePrediction {
  subject: SubjectCode;
  subjectLabel: string;
  predictedScore: number;
  rangeLow: number;
  rangeHigh: number;
  module1Correct: number;
  module1Total: number;
  module2Correct: number;
  module2Total: number;
  module2Tier: 'easy' | 'hard';
  totalCorrect: number;
  totalQuestions: number;
}

export interface ExamScoreReport {
  track: ExamTrack;
  totalScore?: number;
  totalRangeLow?: number;
  totalRangeHigh?: number;
  sections: Partial<Record<SubjectCode, SectionScorePrediction>>;
  domainBreakdown: DomainScoreBreakdown[];
  computedAt: number;
}

export interface ExamSessionState {
  track: ExamTrack;
  phase: ExamPhase;
  currentModuleIndex: number;
  modules: ExamModuleState[];
  flaggedQuestionIds: string[];
  breakTimeRemainingMs: number;
  isExamPaused: boolean;
  scoreReport?: ExamScoreReport;
}

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
  questionCount?: number;
  repetitionFilter?: RepetitionFilter;
  newRatio?: NewPreviousRatio;
}

export interface SessionQuestionState {
  questionId: string;
  draftAnswer: string;
  submittedAnswer?: string;
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
  startedAt: number;
  completedAt?: number;
  totalTime: number; // milliseconds accumulated across the session
  isPaused: boolean;
  exam?: ExamSessionState;
}

export interface Bookmark {
  questionId: string;
  createdAt: number;
  subject?: SubjectCode;
  domain?: string;
  skill?: string;
  difficulty?: DifficultyCode | null;
}

export interface UserSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0 to 1
  defaultDifficulties: DifficultyCode[];
  defaultDifficulty: DifficultyFilter;
  defaultQuestionCount: number;
  defaultRepetitionFilter?: RepetitionFilter;
  defaultNewRatio?: NewPreviousRatio;
}
