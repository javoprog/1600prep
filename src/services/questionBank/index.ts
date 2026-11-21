import {
  PracticeFilters,
  Question,
  QuestionMeta,
  SubjectCode,
  TaxonomyData,
} from '@/types';
import {
  getAllCachedQuestions,
  getAllQuestionMetas,
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
  isValidCompleteSprFormat,
  normalizeDigitalQuestion,
  normalizeDisclosedQuestion,
  normalizeQuestionMetaList,
  RawDigitalQuestion,
  RawDisclosedQuestion,
  RawLookupResponse,
  RawQuestionListItem,
} from './normalizer';

export { evaluateAnswer, isValidCompleteSprFormat };

const QBANK_BASE = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod';
const SAIC_BASE = 'https://saic.collegeboard.org/disclosed';
const REQUEST_TIMEOUT_MS = 12000;
const CATALOG_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RETRIES = 2;

// In-memory cache & deduplication
let memoryTaxonomy: TaxonomyData | null = null;
let memoryMetas: Map<string, QuestionMeta> = new Map();
const memoryQuestions: Map<string, Question> = new Map();
let memoryIsOfflineFallback = false;
const inFlightRequests = new Map<string, Promise<unknown>>();

export function getQuestionFromMemory(questionId: string): Question | undefined {
  return memoryQuestions.get(questionId);
}

class NonRetryableHttpError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableHttpError';
  }
}

function isNonRetryableStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429;
}

function buildProxyGetUrl(
  action: string,
  payload?: Record<string, unknown>
): string {
  const params = new URLSearchParams({ action });
  if (payload) {
    for (const [key, val] of Object.entries(payload)) {
      if (val !== undefined && val !== null) {
        params.set(key, String(val));
      }
    }
  }
  return `/api/qbank?${params.toString()}`;
}

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
          const msg = `College Board API returned HTTP ${res.status}`;
          if (isNonRetryableStatus(res.status)) {
            throw new NonRetryableHttpError(msg);
          }
          throw new Error(msg);
        }
        const data = (await res.json()) as T;
        return data;
      } catch (err) {
        if (err instanceof NonRetryableHttpError) {
          throw err;
        }
        lastError = err instanceof Error ? err : new Error(String(err));
        // Try cacheable GET server-side proxy fallback before retrying
        try {
          const proxyRes = await fetchWithTimeout(
            buildProxyGetUrl(proxyAction, proxyPayload),
            {
              method: 'GET',
              headers: { Accept: 'application/json' },
            }
          );
          if (proxyRes.ok) {
            return (await proxyRes.json()) as T;
          }
          if (isNonRetryableStatus(proxyRes.status)) {
            throw new NonRetryableHttpError(
              `Proxy returned HTTP ${proxyRes.status}`
            );
          }
        } catch (proxyErr) {
          if (proxyErr instanceof NonRetryableHttpError) {
            throw proxyErr;
          }
          // Ignore transient proxy error and continue retry loop
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
  if (!forceRefresh && !memoryIsOfflineFallback && memoryTaxonomy && memoryMetas.size > 0) {
    const isFreshMemory =
      Date.now() - memoryTaxonomy.fetchedAt < CATALOG_CACHE_TTL_MS;
    if (isFreshMemory) {
      return {
        taxonomy: memoryTaxonomy,
        metas: Array.from(memoryMetas.values()),
        isOfflineFallback: false,
      };
    }
  }

  // 1. Check IndexedDB cache first for fast startup when within TTL
  if (!forceRefresh) {
    const [cachedTax, cachedMetas] = await Promise.all([
      getCachedTaxonomy(),
      getAllQuestionMetas(),
    ]);
    if (
      cachedTax &&
      cachedMetas.length > 0 &&
      Date.now() - cachedTax.fetchedAt < CATALOG_CACHE_TTL_MS
    ) {
      memoryTaxonomy = cachedTax;
      memoryMetas = new Map(cachedMetas.map((m) => [m.id, m]));
      memoryIsOfflineFallback = false;
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
    memoryIsOfflineFallback = false;

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
      memoryIsOfflineFallback = true;

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
  // 0. Check in-memory full question cache first for instant 0ms response
  const memCached = memoryQuestions.get(questionId);
  if (memCached && memCached.questionContent) {
    return memCached;
  }

  // 1. Check full question cache in IndexedDB
  const cached = await getCachedQuestion(questionId);
  if (cached && cached.questionContent) {
    memoryQuestions.set(questionId, cached);
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

  // Save to in-memory and IndexedDB cache
  memoryQuestions.set(questionId, normalized);
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

// --- Question Pool Filtering ---

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
