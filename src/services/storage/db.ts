import {
  Question,
  QuestionMeta,
  Session,
  TaxonomyData,
} from '@/types';

const DB_NAME = '1600prep_db';
const DB_VERSION = 1;

export const STORES = {
  QUESTIONS_META: 'questions_meta',
  QUESTIONS_FULL: 'questions_full',
  ATTEMPTS: 'attempts',
  SESSIONS: 'sessions',
  BOOKMARKS: 'bookmarks',
  KV: 'kv_store',
} as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB is not available in this environment'));
  }
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.QUESTIONS_META)) {
        const metaStore = db.createObjectStore(STORES.QUESTIONS_META, { keyPath: 'id' });
        metaStore.createIndex('subject', 'subject', { unique: false });
        metaStore.createIndex('domain', 'domain', { unique: false });
        metaStore.createIndex('skill', 'skill', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.QUESTIONS_FULL)) {
        const fullStore = db.createObjectStore(STORES.QUESTIONS_FULL, { keyPath: 'id' });
        fullStore.createIndex('subject', 'subject', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.ATTEMPTS)) {
        const attemptStore = db.createObjectStore(STORES.ATTEMPTS, { keyPath: 'id' });
        attemptStore.createIndex('questionId', 'questionId', { unique: false });
        attemptStore.createIndex('sessionId', 'sessionId', { unique: false });
        attemptStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        const sessionStore = db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        sessionStore.createIndex('startedAt', 'startedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.BOOKMARKS)) {
        const bookmarkStore = db.createObjectStore(STORES.BOOKMARKS, { keyPath: 'questionId' });
        bookmarkStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.KV)) {
        db.createObjectStore(STORES.KV, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
  });

  return dbPromise;
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let req: IDBRequest<T> | void;
    try {
      req = callback(store);
    } catch (err) {
      reject(err);
      return;
    }

    if (req) {
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } else {
      tx.oncomplete = () => resolve(undefined as unknown as T);
      tx.onerror = () => reject(tx.error);
    }
  });
}

// --- KV Store (Taxonomy & Metadata timestamps) ---

export async function getKV<T>(key: string): Promise<T | null> {
  try {
    const res = await withStore<{ key: string; value: T } | undefined>(
      STORES.KV,
      'readonly',
      (store) => store.get(key)
    );
    return res ? res.value : null;
  } catch {
    return null;
  }
}

export async function setKV<T>(key: string, value: T): Promise<void> {
  try {
    await withStore(STORES.KV, 'readwrite', (store) => store.put({ key, value }));
  } catch (err) {
    console.warn('IndexedDB setKV failed:', err);
  }
}

export async function removeKV(key: string): Promise<void> {
  try {
    await withStore(STORES.KV, 'readwrite', (store) => store.delete(key));
  } catch (err) {
    console.warn('IndexedDB removeKV failed:', err);
  }
}

// --- Active Full Exam Persistence & Seen Question Tracking ---

const ACTIVE_EXAM_KEY = 'active_exam_session_v1';
const SEEN_EXAM_IDS_KEY = 'seen_exam_question_ids_v1';

export async function saveActiveExamSession(session: Session): Promise<void> {
  if (session.mode !== 'exam') return;
  await setKV(ACTIVE_EXAM_KEY, session);
}

export async function loadActiveExamSession(): Promise<Session | null> {
  const saved = await getKV<Session>(ACTIVE_EXAM_KEY);
  if (!saved || saved.mode !== 'exam' || !saved.exam || saved.completedAt) {
    return null;
  }
  // Always restore paused so the student resumes intentionally
  return {
    ...saved,
    isPaused: true,
    exam: {
      ...saved.exam,
      isExamPaused: true,
    },
  };
}

export async function clearActiveExamSession(): Promise<void> {
  await removeKV(ACTIVE_EXAM_KEY);
}

export async function getSeenExamQuestionIds(): Promise<string[]> {
  const saved = await getKV<string[]>(SEEN_EXAM_IDS_KEY);
  return Array.isArray(saved) ? saved : [];
}

export async function addSeenExamQuestionIds(questionIds: string[]): Promise<void> {
  if (!questionIds.length) return;
  const existing = await getSeenExamQuestionIds();
  const merged = Array.from(new Set([...existing, ...questionIds]));
  await setKV(SEEN_EXAM_IDS_KEY, merged);
}

export async function clearSeenExamQuestionIds(subset?: string[]): Promise<void> {
  if (!subset || subset.length === 0) {
    await removeKV(SEEN_EXAM_IDS_KEY);
    return;
  }
  const removeSet = new Set(subset);
  const existing = await getSeenExamQuestionIds();
  await setKV(
    SEEN_EXAM_IDS_KEY,
    existing.filter((id) => !removeSet.has(id))
  );
}

export async function getCachedTaxonomy(): Promise<TaxonomyData | null> {
  return getKV<TaxonomyData>('sat_taxonomy_v1');
}

export async function setCachedTaxonomy(taxonomy: TaxonomyData): Promise<void> {
  return setKV('sat_taxonomy_v1', taxonomy);
}

// --- Question Meta Cache ---

export async function saveQuestionMetas(metas: QuestionMeta[]): Promise<void> {
  if (!metas.length) return;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORES.QUESTIONS_META, 'readwrite');
      const store = tx.objectStore(STORES.QUESTIONS_META);
      for (const meta of metas) {
        store.put(meta);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    console.warn('Failed to cache question metas:', err);
  }
}

export async function getAllQuestionMetas(): Promise<QuestionMeta[]> {
  try {
    return await withStore<QuestionMeta[]>(STORES.QUESTIONS_META, 'readonly', (store) =>
      store.getAll()
    );
  } catch {
    return [];
  }
}

export async function getQuestionMetasBySubject(subject: 'rw' | 'math'): Promise<QuestionMeta[]> {
  try {
    return await withStore<QuestionMeta[]>(STORES.QUESTIONS_META, 'readonly', (store) => {
      const idx = store.index('subject');
      return idx.getAll(subject);
    });
  } catch {
    return [];
  }
}

export async function getQuestionMetaById(id: string): Promise<QuestionMeta | null> {
  try {
    const res = await withStore<QuestionMeta | undefined>(
      STORES.QUESTIONS_META,
      'readonly',
      (store) => store.get(id)
    );
    return res ?? null;
  } catch {
    return null;
  }
}

// --- Full Question Cache ---

export async function saveCachedQuestion(question: Question): Promise<void> {
  try {
    await withStore(STORES.QUESTIONS_FULL, 'readwrite', (store) => store.put(question));
  } catch (err) {
    console.warn('Failed to cache full question:', err);
  }
}

export async function getCachedQuestion(id: string): Promise<Question | null> {
  try {
    const res = await withStore<Question | undefined>(
      STORES.QUESTIONS_FULL,
      'readonly',
      (store) => store.get(id)
    );
    return res ?? null;
  } catch {
    return null;
  }
}

export async function getAllCachedQuestions(): Promise<Question[]> {
  try {
    return await withStore<Question[]>(STORES.QUESTIONS_FULL, 'readonly', (store) =>
      store.getAll()
    );
  } catch {
    return [];
  }
}
