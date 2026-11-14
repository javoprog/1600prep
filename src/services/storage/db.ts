import {
  Attempt,
  Bookmark,
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

// --- Attempts (Never overwrite previous attempts!) ---

export async function recordAttempt(attempt: Attempt): Promise<void> {
  await withStore(STORES.ATTEMPTS, 'readwrite', (store) => store.add(attempt));
}

export async function getAllAttempts(): Promise<Attempt[]> {
  try {
    const list = await withStore<Attempt[]>(STORES.ATTEMPTS, 'readonly', (store) =>
      store.getAll()
    );
    return list.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function getAttemptsByQuestionId(questionId: string): Promise<Attempt[]> {
  try {
    const list = await withStore<Attempt[]>(STORES.ATTEMPTS, 'readonly', (store) => {
      const idx = store.index('questionId');
      return idx.getAll(questionId);
    });
    return list.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}

export async function getAttemptsBySessionId(sessionId: string): Promise<Attempt[]> {
  try {
    const list = await withStore<Attempt[]>(STORES.ATTEMPTS, 'readonly', (store) => {
      const idx = store.index('sessionId');
      return idx.getAll(sessionId);
    });
    return list.sort((a, b) => a.timestamp - b.timestamp);
  } catch {
    return [];
  }
}

// --- Sessions ---

export async function saveSession(session: Session): Promise<void> {
  await withStore(STORES.SESSIONS, 'readwrite', (store) => store.put(session));
}

export async function getSessionById(id: string): Promise<Session | null> {
  try {
    const res = await withStore<Session | undefined>(
      STORES.SESSIONS,
      'readonly',
      (store) => store.get(id)
    );
    return res ?? null;
  } catch {
    return null;
  }
}

export async function getAllSessions(): Promise<Session[]> {
  try {
    const list = await withStore<Session[]>(STORES.SESSIONS, 'readonly', (store) =>
      store.getAll()
    );
    return list.sort((a, b) => b.startedAt - a.startedAt);
  } catch {
    return [];
  }
}

export async function deleteSession(id: string): Promise<void> {
  try {
    await withStore(STORES.SESSIONS, 'readwrite', (store) => store.delete(id));
  } catch (err) {
    console.warn('Failed to delete session:', err);
  }
}

// --- Bookmarks ---

export async function getBookmarks(): Promise<Bookmark[]> {
  try {
    const list = await withStore<Bookmark[]>(STORES.BOOKMARKS, 'readonly', (store) =>
      store.getAll()
    );
    return list.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function isQuestionBookmarked(questionId: string): Promise<boolean> {
  try {
    const res = await withStore<Bookmark | undefined>(
      STORES.BOOKMARKS,
      'readonly',
      (store) => store.get(questionId)
    );
    return !!res;
  } catch {
    return false;
  }
}

export async function addBookmark(bookmark: Bookmark): Promise<void> {
  await withStore(STORES.BOOKMARKS, 'readwrite', (store) => store.put(bookmark));
}

export async function removeBookmark(questionId: string): Promise<void> {
  await withStore(STORES.BOOKMARKS, 'readwrite', (store) => store.delete(questionId));
}

// --- Clear User Progress ---

export async function clearAllUserProgress(): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(
      [STORES.ATTEMPTS, STORES.SESSIONS, STORES.BOOKMARKS],
      'readwrite'
    );
    tx.objectStore(STORES.ATTEMPTS).clear();
    tx.objectStore(STORES.SESSIONS).clear();
    tx.objectStore(STORES.BOOKMARKS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
