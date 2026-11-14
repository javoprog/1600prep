import {
  Attempt,
  Bookmark,
  PracticeFilters,
  Question,
  QuestionMeta,
  SubjectCode,
  TaxonomyData,
} from '@/types';
import {
  getAllAttempts,
  getAllCachedQuestions,
  getAllQuestionMetas,
  getBookmarks,
  getCachedQuestion,
  getCachedTaxonomy,
  getQuestionMetaById,
  saveCachedQuestion,
  saveQuestionMetas,
  setCachedTaxonomy,
} from '@/services/storage/db';
import {
  buildTaxonomyFromLookupAndMetas,
  evaluateAnswer,
  normalizeDigitalQuestion,
  normalizeDisclosedQuestion,
  normalizeQuestionMetaList,
  RawDigitalQuestion,
  RawDisclosedQuestion,
  RawLookupResponse,
  RawQuestionListItem,
} from './normalizer';

export { evaluateAnswer };

const QBANK_BASE = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod';
const SAIC_BASE = 'https://saic.collegeboard.org/disclosed';
const REQUEST_TIMEOUT_MS = 12000;
const MAX_RETRIES = 2;

// In-memory cache & deduplication
let memoryTaxonomy: TaxonomyData | null = null;
let memoryMetas: Map<string, QuestionMeta> = new Map();
const inFlightRequests = new Map<string, Promise<unknown>>();

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function requestQBank<T>(
  dedupeKey: string,
  directRequest: () => Promise<Response>,
  proxyAction: string,
  proxyPayload?: Record<string, unknown>
): Promise<T> {
  if (inFlightRequests.has(dedupeKey)) {
    return inFlightRequests.get(dedupeKey) as Promise<T>;
  }

  const promise = (async (): Promise<T> => {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const res = await directRequest();
        if (!res.ok) {
          throw new Error(`College Board API returned HTTP ${res.status}`);
        }
        const data = (await res.json()) as T;
        return data;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        // Try server-side proxy fallback before retrying
        try {
          const proxyRes = await fetchWithTimeout('/api/qbank', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: proxyAction, payload: proxyPayload }),
          });
          if (proxyRes.ok) {
            return (await proxyRes.json()) as T;
          }
        } catch {
          // Ignore proxy error and continue retry loop
        }

        if (attempt < MAX_RETRIES) {
          await sleep(400 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Failed to communicate with College Board Question Bank API');
  })();

  inFlightRequests.set(dedupeKey, promise);
  try {
    return await promise;
  } finally {
    inFlightRequests.delete(dedupeKey);
  }
}

export interface CatalogInitResult {
  taxonomy: TaxonomyData;
  metas: QuestionMeta[];
  isOfflineFallback: boolean;
  errorWarning?: string;
}

export async function initializeCatalog(forceRefresh = false): Promise<CatalogInitResult> {
  if (!forceRefresh && memoryTaxonomy && memoryMetas.size > 0) {
    return {
      taxonomy: memoryTaxonomy,
      metas: Array.from(memoryMetas.values()),
      isOfflineFallback: false,
    };
  }

  // 1. Check IndexedDB cache first for fast startup
  if (!forceRefresh) {
    const [cachedTax, cachedMetas] = await Promise.all([
      getCachedTaxonomy(),
      getAllQuestionMetas(),
    ]);
    if (cachedTax && cachedMetas.length > 0) {
      memoryTaxonomy = cachedTax;
      memoryMetas = new Map(cachedMetas.map((m) => [m.id, m]));
      return {
        taxonomy: cachedTax,
        metas: cachedMetas,
        isOfflineFallback: false,
      };
    }
  }

  // 2. Fetch live from College Board API
  try {
    const lookup = await requestQBank<RawLookupResponse>(
      'lookup',
      () =>
        fetchWithTimeout(`${QBANK_BASE}/questionbank/lookup`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
      'lookup'
    );

    const rwDomainCodes =
      lookup?.lookupData?.domain?.['R&W']?.map((d) => d.primaryClassCd).join(',') ||
      'INI,CAS,EOI,SEC';
    const mathDomainCodes =
      lookup?.lookupData?.domain?.Math?.map((d) => d.primaryClassCd).join(',') || 'H,P,Q,S';

    const [rawRwList, rawMathList] = await Promise.all([
      requestQBank<RawQuestionListItem[]>(
        `get-questions-rw-${rwDomainCodes}`,
        () =>
          fetchWithTimeout(`${QBANK_BASE}/questionbank/digital/get-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              asmtEventId: 99,
              test: 1,
              domain: rwDomainCodes,
            }),
          }),
        'get-questions',
        { asmtEventId: 99, test: 1, domain: rwDomainCodes }
      ),
      requestQBank<RawQuestionListItem[]>(
        `get-questions-math-${mathDomainCodes}`,
        () =>
          fetchWithTimeout(`${QBANK_BASE}/questionbank/digital/get-questions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              asmtEventId: 99,
              test: 2,
              domain: mathDomainCodes,
            }),
          }),
        'get-questions',
        { asmtEventId: 99, test: 2, domain: mathDomainCodes }
      ),
    ]);

    if (!Array.isArray(rawRwList) || !Array.isArray(rawMathList)) {
      throw new Error('Invalid question list response from College Board API');
    }

    const rwMetas = normalizeQuestionMetaList(rawRwList, 'rw');
    const mathMetas = normalizeQuestionMetaList(rawMathList, 'math');
    const allMetas = [...rwMetas, ...mathMetas];

    const taxonomy = buildTaxonomyFromLookupAndMetas(lookup, rwMetas, mathMetas);

    memoryTaxonomy = taxonomy;
    memoryMetas = new Map(allMetas.map((m) => [m.id, m]));

    // Persist asynchronously to IndexedDB
    Promise.all([setCachedTaxonomy(taxonomy), saveQuestionMetas(allMetas)]).catch((err) =>
      console.warn('Background cache save error:', err)
    );

    return {
      taxonomy,
      metas: allMetas,
      isOfflineFallback: false,
    };
  } catch (apiError) {
    // 3. Offline / Outage Fallback: check if any metas or cached full questions exist in IndexedDB
    const [cachedTax, cachedMetas, cachedFull] = await Promise.all([
      getCachedTaxonomy(),
      getAllQuestionMetas(),
      getAllCachedQuestions(),
    ]);

    const fallbackMetas = cachedMetas.length > 0 ? cachedMetas : cachedFull;
    if (fallbackMetas.length > 0) {
      const rwMetas = fallbackMetas.filter((m) => m.subject === 'rw');
      const mathMetas = fallbackMetas.filter((m) => m.subject === 'math');
      const taxonomy =
        cachedTax || buildTaxonomyFromLookupAndMetas(null, rwMetas, mathMetas);

      memoryTaxonomy = taxonomy;
      memoryMetas = new Map(fallbackMetas.map((m) => [m.id, m]));

      return {
        taxonomy,
        metas: fallbackMetas,
        isOfflineFallback: true,
        errorWarning:
          'College Board API is currently unreachable. Showing locally cached SAT questions.',
      };
    }

    throw apiError;
  }
}

export async function fetchQuestionDetail(questionId: string): Promise<Question> {
  // 1. Check full question cache in IndexedDB first
  const cached = await getCachedQuestion(questionId);
  if (cached && cached.questionContent) {
    return cached;
  }

  // 2. Get QuestionMeta from memory or IndexedDB
  let meta = memoryMetas.get(questionId) || (await getQuestionMetaById(questionId));
  if (!meta) {
    await initializeCatalog();
    meta = memoryMetas.get(questionId) || null;
  }
  if (!meta) {
    throw new Error(`Question metadata not found for ID: ${questionId}`);
  }

  // 3. Fetch from appropriate College Board endpoint
  let normalized: Question;

  if (meta.externalId) {
    const raw = await requestQBank<RawDigitalQuestion>(
      `digital-q-${meta.externalId}`,
      () =>
        fetchWithTimeout(`${QBANK_BASE}/questionbank/digital/get-question`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ external_id: meta!.externalId }),
        }),
      'get-question',
      { external_id: meta.externalId }
    );

    if (!raw || typeof raw !== 'object' || (!raw.stem && !raw.stimulus)) {
      throw new Error(`Invalid question content received for ${meta.questionId}`);
    }

    normalized = normalizeDigitalQuestion(meta, raw);
  } else if (meta.ibn) {
    const rawList = await requestQBank<RawDisclosedQuestion[]>(
      `disclosed-q-${meta.ibn}`,
      () =>
        fetchWithTimeout(`${SAIC_BASE}/${meta!.ibn}.json`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        }),
      'get-disclosed',
      { ibn: meta.ibn }
    );

    if (!Array.isArray(rawList) || rawList.length === 0) {
      throw new Error(`Invalid disclosed question content for ${meta.ibn}`);
    }

    normalized = normalizeDisclosedQuestion(meta, rawList);
  } else {
    throw new Error(`Question ${questionId} has neither externalId nor ibn`);
  }

  // Save to IndexedDB cache
  await saveCachedQuestion(normalized);
  return normalized;
}

export function prefetchQuestions(questionIds: string[]): void {
  const toPrefetch = questionIds.slice(0, 5);
  for (const id of toPrefetch) {
    fetchQuestionDetail(id).catch(() => {
      // Silent background prefetch
    });
  }
}

// --- Question Pool Filtering & Repetition Engine ---

export interface PoolCounts {
  totalMatching: number;
  newCount: number;
  previousCount: number;
  incorrectCount: number;
  bookmarkedCount: number;
  effectiveAvailable: number;
}

function matchesBaseFilters(meta: QuestionMeta, filters: PracticeFilters): boolean {
  if (meta.subject !== filters.subject) return false;

  if (filters.domains.length > 0 && !filters.domains.includes(meta.domain)) {
    return false;
  }

  if (filters.skills.length > 0) {
    const matchesSkill =
      filters.skills.includes(meta.skill) ||
      filters.skills.includes(meta.skillLabel);
    if (!matchesSkill) return false;
  }

  if (Array.isArray(filters.difficulties)) {
    if (filters.difficulties.length === 0) {
      return false;
    }
    if (filters.difficulties.length < 3) {
      if (!meta.difficulty || !filters.difficulties.includes(meta.difficulty)) {
        return false;
      }
    }
  } else if (filters.difficulty && filters.difficulty !== 'ALL') {
    // Do not invent difficulty labels for questions with missing metadata
    if (!meta.difficulty || meta.difficulty !== filters.difficulty) {
      return false;
    }
  }

  return true;
}

function buildAttemptMaps(attempts: Attempt[], bookmarks: Bookmark[]) {
  const attemptsByQuestion = new Map<string, Attempt[]>();
  // attempts is already sorted newest first by getAllAttempts()
  for (const att of attempts) {
    const list = attemptsByQuestion.get(att.questionId);
    if (list) {
      list.push(att);
    } else {
      attemptsByQuestion.set(att.questionId, [att]);
    }
  }

  const bookmarkedIds = new Set(bookmarks.map((b) => b.questionId));
  return { attemptsByQuestion, bookmarkedIds };
}

export async function getPoolBreakdown(
  metas: QuestionMeta[],
  filters: PracticeFilters
): Promise<{
  basePool: QuestionMeta[];
  newPool: QuestionMeta[];
  previousPool: QuestionMeta[];
  incorrectPool: QuestionMeta[];
  bookmarkedPool: QuestionMeta[];
  counts: PoolCounts;
}> {
  const [attempts, bookmarks] = await Promise.all([getAllAttempts(), getBookmarks()]);
  const { attemptsByQuestion, bookmarkedIds } = buildAttemptMaps(attempts, bookmarks);

  const basePool = metas.filter((m) => matchesBaseFilters(m, filters));
  const newPool: QuestionMeta[] = [];
  const previousPool: QuestionMeta[] = [];
  const incorrectPool: QuestionMeta[] = [];
  const bookmarkedPool: QuestionMeta[] = [];

  for (const m of basePool) {
    const qAttempts = attemptsByQuestion.get(m.id);
    if (!qAttempts || qAttempts.length === 0) {
      newPool.push(m);
    } else {
      previousPool.push(m);
      // Include in incorrectPool if most recent attempt was incorrect (or any attempt was incorrect)
      const latest = qAttempts[0];
      if (!latest.isCorrect) {
        incorrectPool.push(m);
      }
    }

    if (bookmarkedIds.has(m.id)) {
      bookmarkedPool.push(m);
    }
  }

  let effectiveAvailable = basePool.length;
  switch (filters.repetitionFilter) {
    case 'new':
      effectiveAvailable = newPool.length;
      break;
    case 'previous':
      effectiveAvailable = previousPool.length;
      break;
    case 'incorrect':
      effectiveAvailable = incorrectPool.length;
      break;
    case 'bookmarked':
      effectiveAvailable = bookmarkedPool.length;
      break;
    case 'all':
      effectiveAvailable = basePool.length;
      break;
  }

  return {
    basePool,
    newPool,
    previousPool,
    incorrectPool,
    bookmarkedPool,
    counts: {
      totalMatching: basePool.length,
      newCount: newPool.length,
      previousCount: previousPool.length,
      incorrectCount: incorrectPool.length,
      bookmarkedCount: bookmarkedPool.length,
      effectiveAvailable,
    },
  };
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export async function selectQuestionsForSession(
  metas: QuestionMeta[],
  filters: PracticeFilters
): Promise<QuestionMeta[]> {
  const basePool = metas.filter((m) => matchesBaseFilters(m, filters));
  const shuffled = shuffleArray(basePool);

  if (filters.questionCount && filters.questionCount > 0) {
    return shuffled.slice(0, filters.questionCount);
  }

  // Continuous / infinite practice until matching questions run out
  return shuffled;
}

export function getMetaFromMemory(questionId: string): QuestionMeta | undefined {
  return memoryMetas.get(questionId);
}

export function getAllMetasFromMemory(subject?: SubjectCode): QuestionMeta[] {
  const all = Array.from(memoryMetas.values());
  if (!subject) return all;
  return all.filter((m) => m.subject === subject);
}
