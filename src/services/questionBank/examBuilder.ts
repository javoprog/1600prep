import {
  AdaptiveTier,
  DifficultyCode,
  ExamModuleState,
  ExamTrack,
  QuestionMeta,
  SubjectCode,
} from '@/types';

export const RW_MODULE_QUESTION_COUNT = 27;
export const MATH_MODULE_QUESTION_COUNT = 22;
export const RW_MODULE_TIME_MS = 32 * 60 * 1000;
export const MATH_MODULE_TIME_MS = 35 * 60 * 1000;
export const EXAM_BREAK_TIME_MS = 10 * 60 * 1000;

interface DomainSlot {
  domain: string;
  count: number;
}

// Official Digital SAT domain ordering & counts per module
const RW_MODULE_1_DOMAINS: DomainSlot[] = [
  { domain: 'CAS', count: 7 }, // Craft and Structure
  { domain: 'INI', count: 7 }, // Information and Ideas
  { domain: 'SEC', count: 7 }, // Standard English Conventions
  { domain: 'EOI', count: 6 }, // Expression of Ideas
];

const RW_MODULE_2_DOMAINS: DomainSlot[] = [
  { domain: 'CAS', count: 7 },
  { domain: 'INI', count: 7 },
  { domain: 'SEC', count: 6 },
  { domain: 'EOI', count: 7 },
];

// Official Math proportions (~35% Algebra, ~35% Advanced Math, ~15% Data Analysis, ~15% Geometry)
const MATH_MODULE_1_DOMAINS: DomainSlot[] = [
  { domain: 'H', count: 8 }, // Algebra
  { domain: 'P', count: 7 }, // Advanced Math
  { domain: 'Q', count: 4 }, // Problem-Solving and Data Analysis
  { domain: 'S', count: 3 }, // Geometry and Trigonometry
];

const MATH_MODULE_2_DOMAINS: DomainSlot[] = [
  { domain: 'H', count: 7 },
  { domain: 'P', count: 8 },
  { domain: 'Q', count: 3 },
  { domain: 'S', count: 4 },
];

// Difficulty share weights by adaptive tier
const TIER_DIFFICULTY_RATIOS: Record<
  AdaptiveTier,
  Record<DifficultyCode, number>
> = {
  baseline: { E: 0.35, M: 0.4, H: 0.25 },
  easy: { E: 0.55, M: 0.35, H: 0.1 },
  hard: { E: 0.15, M: 0.35, H: 0.5 },
};

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getEffectiveBand(meta: QuestionMeta): number {
  if (typeof meta.scoreBand === 'number' && meta.scoreBand >= 1 && meta.scoreBand <= 7) {
    return meta.scoreBand;
  }
  if (meta.difficulty === 'E') return 2;
  if (meta.difficulty === 'H') return 6;
  return 4;
}

/**
 * Allocate integer difficulty counts that sum strictly to `total`.
 */
function allocateDifficultyCounts(
  total: number,
  tier: AdaptiveTier
): Record<DifficultyCode, number> {
  const ratios = TIER_DIFFICULTY_RATIOS[tier];
  const eCount = Math.round(total * ratios.E);
  const mCount = Math.round(total * ratios.M);
  const hCount = Math.max(0, total - eCount - mCount);
  const diffSum = eCount + mCount + hCount;

  if (diffSum === total) {
    return { E: eCount, M: mCount, H: hCount };
  }
  return {
    E: eCount,
    M: Math.max(0, total - eCount - hCount),
    H: hCount,
  };
}

/**
 * Picks up to `count` items from `candidates` preferring unseen questions first
 * and respecting preferred score band ordering when in easy/hard adaptive tiers.
 */
function pickWithFreshness(
  candidates: QuestionMeta[],
  count: number,
  tier: AdaptiveTier,
  seenSet: Set<string>,
  usedSet: Set<string>
): QuestionMeta[] {
  if (count <= 0) return [];

  const available = candidates.filter((m) => !usedSet.has(m.id));
  const unseen = shuffleArray(available.filter((m) => !seenSet.has(m.id)));
  const seen = shuffleArray(available.filter((m) => seenSet.has(m.id)));

  // For adaptive tiers, subtly bias band selection within the shuffled candidates
  const biasSort = (list: QuestionMeta[]) => {
    if (tier === 'hard') {
      return [...list].sort(
        (a, b) => getEffectiveBand(b) + (Math.random() * 2.5 - 1.25) - getEffectiveBand(a)
      );
    }
    if (tier === 'easy') {
      return [...list].sort(
        (a, b) => getEffectiveBand(a) + (Math.random() * 2.5 - 1.25) - getEffectiveBand(b)
      );
    }
    return list;
  };

  const ordered = [...biasSort(unseen), ...biasSort(seen)];
  const picked = ordered.slice(0, count);
  for (const item of picked) {
    usedSet.add(item.id);
  }
  return picked;
}

function getAdjacentDifficulties(diff: DifficultyCode): DifficultyCode[] {
  if (diff === 'E') return ['E', 'M', 'H'];
  if (diff === 'H') return ['H', 'M', 'E'];
  return ['M', 'E', 'H'];
}

export function buildExamModule(params: {
  metas: QuestionMeta[];
  subject: SubjectCode;
  moduleNumber: 1 | 2;
  tier: AdaptiveTier;
  seenIds: Iterable<string>;
  excludeIds: Iterable<string>;
}): ExamModuleState {
  const { metas, subject, moduleNumber, tier, seenIds, excludeIds } = params;

  const isRw = subject === 'rw';
  const targetCount = isRw ? RW_MODULE_QUESTION_COUNT : MATH_MODULE_QUESTION_COUNT;
  const timeLimitMs = isRw ? RW_MODULE_TIME_MS : MATH_MODULE_TIME_MS;
  const slots = isRw
    ? moduleNumber === 1
      ? RW_MODULE_1_DOMAINS
      : RW_MODULE_2_DOMAINS
    : moduleNumber === 1
    ? MATH_MODULE_1_DOMAINS
    : MATH_MODULE_2_DOMAINS;

  const seenSet = new Set(seenIds);
  const usedSet = new Set(excludeIds);
  const subjectPool = metas.filter((m) => m.subject === subject);

  const selectedItems: QuestionMeta[] = [];

  for (const slot of slots) {
    const domainPool = subjectPool.filter((m) => m.domain === slot.domain);
    const diffTargets = allocateDifficultyCounts(slot.count, tier);
    const domainItems: QuestionMeta[] = [];

    for (const targetDiff of ['E', 'M', 'H'] as DifficultyCode[]) {
      let remaining = diffTargets[targetDiff];
      for (const fallbackDiff of getAdjacentDifficulties(targetDiff)) {
        if (remaining <= 0) break;
        const picked = pickWithFreshness(
          domainPool.filter((m) => m.difficulty === fallbackDiff),
          remaining,
          tier,
          seenSet,
          usedSet
        );
        domainItems.push(...picked);
        remaining -= picked.length;
      }
      if (remaining > 0) {
        const picked = pickWithFreshness(
          domainPool,
          remaining,
          tier,
          seenSet,
          usedSet
        );
        domainItems.push(...picked);
      }
    }

    // In R&W, keep official domain grouping (CAS -> INI -> SEC -> EOI) with gentle band ramp
    if (isRw) {
      domainItems.sort(
        (a, b) =>
          getEffectiveBand(a) +
          (Math.random() * 2 - 1) -
          (getEffectiveBand(b) + (Math.random() * 2 - 1))
      );
    }

    selectedItems.push(...domainItems);
  }

  // Top up from the broader subject pool if any domain fell short
  if (selectedItems.length < targetCount) {
    const shortage = targetCount - selectedItems.length;
    const filler = pickWithFreshness(
      subjectPool,
      shortage,
      tier,
      seenSet,
      usedSet
    );
    selectedItems.push(...filler);
  }

  // Fallback: if unseen + excluded left fewer than targetCount, ignore seen history (keep only excludeIds)
  if (selectedItems.length < targetCount) {
    const shortage = targetCount - selectedItems.length;
    const filler = pickWithFreshness(
      subjectPool,
      shortage,
      tier,
      new Set(),
      usedSet
    );
    selectedItems.push(...filler);
  }

  // Math modules broadly ramp from accessible -> challenging across all 4 domains
  if (!isRw) {
    selectedItems.sort((a, b) => {
      const bandA = getEffectiveBand(a) + (Math.random() * 2.2 - 1.1);
      const bandB = getEffectiveBand(b) + (Math.random() * 2.2 - 1.1);
      return bandA - bandB;
    });
  }

  const subjectName = isRw ? 'Reading & Writing' : 'Math';
  const shortSubject = isRw ? 'R&W' : 'Math';

  return {
    id: `${subject}-m${moduleNumber}`,
    subject,
    moduleNumber,
    label: `${subjectName} • Module ${moduleNumber}`,
    shortLabel: `${shortSubject} M${moduleNumber}`,
    tier,
    timeLimitMs,
    timeRemainingMs: timeLimitMs,
    questionIds: selectedItems.slice(0, targetCount).map((m) => m.id),
    locked: false,
  };
}

export function buildInitialExamModules(params: {
  metas: QuestionMeta[];
  track: ExamTrack;
  seenIds: Iterable<string>;
}): ExamModuleState[] {
  const { metas, track, seenIds } = params;
  const firstSubject: SubjectCode = track === 'math' ? 'math' : 'rw';
  const firstModule = buildExamModule({
    metas,
    subject: firstSubject,
    moduleNumber: 1,
    tier: 'baseline',
    seenIds,
    excludeIds: [],
  });

  return [firstModule];
}
