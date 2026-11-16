import {
  DomainScoreBreakdown,
  ExamModuleState,
  ExamScoreReport,
  ExamTrack,
  QuestionMeta,
  SectionScorePrediction,
  Session,
  SessionQuestionState,
  SubjectCode,
} from '@/types';

const SCORE_BAND_WEIGHTS: Record<number, number> = {
  1: 0.78,
  2: 0.86,
  3: 0.94,
  4: 1.02,
  5: 1.12,
  6: 1.22,
  7: 1.32,
};

/**
 * Returns psychometric item difficulty weight using College Board Score Band (1-7)
 * or fallback E/M/H difficulty tier.
 */
export function getItemDifficultyWeight(meta?: QuestionMeta): number {
  if (!meta) return 1.0;
  if (typeof meta.scoreBand === 'number' && SCORE_BAND_WEIGHTS[meta.scoreBand]) {
    return SCORE_BAND_WEIGHTS[meta.scoreBand];
  }
  if (meta.difficulty === 'E') return 0.86;
  if (meta.difficulty === 'H') return 1.24;
  return 1.0;
}

interface ModulePerformanceMetrics {
  rawCorrect: number;
  total: number;
  rawRatio: number;
  weightedRatio: number;
  effectiveRatio: number;
}

export function computeModuleMetrics(
  questionIds: string[],
  questionStates: Record<string, SessionQuestionState>,
  metaMap: Map<string, QuestionMeta>
): ModulePerformanceMetrics {
  const total = questionIds.length;
  if (total === 0) {
    return {
      rawCorrect: 0,
      total: 0,
      rawRatio: 0,
      weightedRatio: 0,
      effectiveRatio: 0,
    };
  }

  let rawCorrect = 0;
  let weightedEarned = 0;
  let weightedTotal = 0;

  for (const qId of questionIds) {
    const meta = metaMap.get(qId);
    const weight = getItemDifficultyWeight(meta);
    weightedTotal += weight;

    const st = questionStates[qId];
    if (st?.isCorrect) {
      rawCorrect += 1;
      weightedEarned += weight;
    }
  }

  const rawRatio = rawCorrect / total;
  const weightedRatio = weightedTotal > 0 ? weightedEarned / weightedTotal : rawRatio;
  const effectiveRatio = 0.65 * weightedRatio + 0.35 * rawRatio;

  return {
    rawCorrect,
    total,
    rawRatio,
    weightedRatio,
    effectiveRatio,
  };
}

/**
 * Routes a student to Easier or Harder Module 2 based on Module 1 weighted performance,
 * approximating official Bluebook MST thresholds (~60% effective mastery).
 */
export function determineModule2Tier(
  module1: ExamModuleState,
  questionStates: Record<string, SessionQuestionState>,
  metaMap: Map<string, QuestionMeta>
): 'easy' | 'hard' {
  const metrics = computeModuleMetrics(
    module1.questionIds,
    questionStates,
    metaMap
  );
  const cutoff = module1.subject === 'rw' ? 0.59 : 0.6;
  return metrics.effectiveRatio >= cutoff ? 'hard' : 'easy';
}

function roundToTen(score: number): number {
  return Math.round(score / 10) * 10;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes a realistic 200-800 scaled section prediction conditioned on:
 * - Adaptive Module 2 path ('easy' caps near 630; 'hard' unlocks up to 800)
 * - Difficulty-weighted Module 1 & Module 2 performance
 */
export function predictSectionScore(
  subject: SubjectCode,
  module1: ExamModuleState,
  module2: ExamModuleState,
  questionStates: Record<string, SessionQuestionState>,
  metaMap: Map<string, QuestionMeta>
): SectionScorePrediction {
  const m1 = computeModuleMetrics(module1.questionIds, questionStates, metaMap);
  const m2 = computeModuleMetrics(module2.questionIds, questionStates, metaMap);
  const tier: 'easy' | 'hard' = module2.tier === 'hard' ? 'hard' : 'easy';

  const totalCorrect = m1.rawCorrect + m2.rawCorrect;
  const totalQuestions = m1.total + m2.total;

  let rawPredicted = 200;

  if (totalCorrect === 0) {
    rawPredicted = 200;
  } else if (tier === 'hard') {
    const overallPerf = clamp(
      0.4 * m1.effectiveRatio + 0.6 * m2.effectiveRatio,
      0,
      1
    );
    // Slight top-end equating forgiveness matching Digital SAT hard module curves
    rawPredicted = 350 + 450 * Math.pow(overallPerf, 0.88);
    if (totalQuestions - totalCorrect === 1) {
      rawPredicted = Math.max(rawPredicted, 780);
    }
    rawPredicted = clamp(rawPredicted, 450, 800);
  } else {
    const overallPerf = clamp(
      0.55 * m1.effectiveRatio + 0.45 * m2.effectiveRatio,
      0,
      1
    );
    const normalizedOnEasyPath = clamp(overallPerf / 0.82, 0, 1);
    rawPredicted = 200 + 430 * Math.pow(normalizedOnEasyPath, 0.92);
    rawPredicted = clamp(rawPredicted, 200, 630);
  }

  const predictedScore = clamp(
    roundToTen(rawPredicted),
    200,
    tier === 'easy' ? 630 : 800
  );
  const rangeLow = Math.max(200, predictedScore - 30);
  const rangeHigh = Math.min(tier === 'easy' ? 650 : 800, predictedScore + 30);

  return {
    subject,
    subjectLabel: subject === 'rw' ? 'Reading & Writing' : 'Math',
    predictedScore,
    rangeLow,
    rangeHigh,
    module1Correct: m1.rawCorrect,
    module1Total: m1.total,
    module2Correct: m2.rawCorrect,
    module2Total: m2.total,
    module2Tier: tier,
    totalCorrect,
    totalQuestions,
  };
}

export function computeExamScoreReport(
  session: Session,
  metaMap: Map<string, QuestionMeta>
): ExamScoreReport {
  const exam = session.exam;
  const track: ExamTrack = exam?.track || 'full';
  const modules = exam?.modules || [];

  const sections: Partial<Record<SubjectCode, SectionScorePrediction>> = {};

  for (const subj of ['rw', 'math'] as SubjectCode[]) {
    const m1 = modules.find((m) => m.subject === subj && m.moduleNumber === 1);
    const m2 = modules.find((m) => m.subject === subj && m.moduleNumber === 2);
    if (m1 && m2) {
      sections[subj] = predictSectionScore(
        subj,
        m1,
        m2,
        session.questionStates,
        metaMap
      );
    }
  }

  const domainMap = new Map<string, DomainScoreBreakdown>();
  for (const mod of modules) {
    for (const qId of mod.questionIds) {
      const meta = metaMap.get(qId);
      const st = session.questionStates[qId];
      const domainCode = meta?.domain || 'OTHER';
      const domainLabel = meta?.domainLabel || domainCode;
      const mapKey = `${mod.subject}:${domainCode}`;

      const entry = domainMap.get(mapKey) || {
        domain: domainCode,
        domainLabel,
        subject: mod.subject,
        correct: 0,
        total: 0,
      };
      entry.total += 1;
      if (st?.isCorrect) {
        entry.correct += 1;
      }
      domainMap.set(mapKey, entry);
    }
  }

  let totalScore: number | undefined;
  let totalRangeLow: number | undefined;
  let totalRangeHigh: number | undefined;

  if (track === 'full' && sections.rw && sections.math) {
    totalScore = sections.rw.predictedScore + sections.math.predictedScore;
    totalRangeLow = Math.max(400, totalScore - 50);
    totalRangeHigh = Math.min(1600, totalScore + 50);
  }

  return {
    track,
    totalScore,
    totalRangeLow,
    totalRangeHigh,
    sections,
    domainBreakdown: Array.from(domainMap.values()),
    computedAt: Date.now(),
  };
}
