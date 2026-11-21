import {
  Attempt,
  SavedResultsSummary,
  SavedSessionItem,
  Session,
  UserProfile,
} from '@/types';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'
).replace(/\/$/, '');

const AUTH_TOKEN_KEY = '1600prep_auth_token_v1';
const PENDING_GUEST_RESULTS_KEY = '1600prep_guest_results_buffer_v1';

export interface AuthResponse {
  token: string;
  user: UserProfile;
}

export interface GuestResultsBuffer {
  attempts: Attempt[];
  sessions: SavedSessionItem[];
}

export function getStoredAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredAuthToken(token: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!token) {
      window.localStorage.removeItem(AUTH_TOKEN_KEY);
    } else {
      window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    }
  } catch {
    // Ignore storage error
  }
}

export function loadGuestResultsBuffer(): GuestResultsBuffer {
  if (typeof window === 'undefined') return { attempts: [], sessions: [] };
  try {
    const raw = window.sessionStorage.getItem(PENDING_GUEST_RESULTS_KEY);
    if (!raw) return { attempts: [], sessions: [] };
    const parsed = JSON.parse(raw) as GuestResultsBuffer;
    return {
      attempts: Array.isArray(parsed?.attempts) ? parsed.attempts : [],
      sessions: Array.isArray(parsed?.sessions) ? parsed.sessions : [],
    };
  } catch {
    return { attempts: [], sessions: [] };
  }
}

export function saveGuestResultsBuffer(buffer: GuestResultsBuffer): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(
      PENDING_GUEST_RESULTS_KEY,
      JSON.stringify(buffer)
    );
  } catch {
    // Ignore storage error
  }
}

export function bufferGuestAttempt(attempt: Attempt): void {
  const buf = loadGuestResultsBuffer();
  const filtered = buf.attempts.filter((a) => a.id !== attempt.id);
  filtered.push(attempt);
  saveGuestResultsBuffer({
    attempts: filtered,
    sessions: buf.sessions,
  });
}

export function sessionToSavedSessionItem(session: Session): SavedSessionItem {
  let answeredCount = 0;
  let correctCount = 0;

  session.questionIds.forEach((qId) => {
    const st = session.questionStates[qId];
    if (st?.isSubmitted) {
      answeredCount++;
      if (st.isCorrect) {
        correctCount++;
      }
    }
  });

  return {
    id: session.id,
    subject: session.subject,
    mode: session.mode,
    title: session.title,
    totalQuestions: session.questionIds.length,
    answeredCount,
    correctCount,
    totalTime: Math.round(session.totalTime || 0),
    startedAt: session.startedAt,
    completedAt: session.completedAt || null,
  };
}

export function bufferGuestSession(session: Session): void {
  const item = sessionToSavedSessionItem(session);
  if (item.answeredCount === 0) return;

  const buf = loadGuestResultsBuffer();
  const filtered = buf.sessions.filter((s) => s.id !== item.id);
  filtered.push(item);
  saveGuestResultsBuffer({
    attempts: buf.attempts,
    sessions: filtered,
  });
}

export function clearGuestResultsBuffer(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(PENDING_GUEST_RESULTS_KEY);
  } catch {
    // Ignore
  }
}

async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const msg = Array.isArray(data?.message)
      ? data.message[0]
      : data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return data as T;
}

// ============================================================================
// AUTH & PROFILE ENDPOINTS
// ============================================================================

export async function registerWithEmail(payload: {
  name?: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginWithEmail(payload: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCurrentUser(token: string): Promise<UserProfile> {
  return apiRequest<UserProfile>('/auth/me', {}, token);
}

export async function updateUserProfile(
  token: string,
  payload: { name?: string; email?: string }
): Promise<UserProfile> {
  return apiRequest<UserProfile>(
    '/auth/profile',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function changeUserPassword(
  token: string,
  payload: { currentPassword: string; newPassword: string }
): Promise<{ updated: boolean }> {
  return apiRequest<{ updated: boolean }>(
    '/auth/password',
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function deleteUserAccount(
  token: string
): Promise<{ deleted: boolean }> {
  return apiRequest<{ deleted: boolean }>(
    '/auth/account',
    {
      method: 'DELETE',
    },
    token
  );
}

// ============================================================================
// SAVED RESULTS ENDPOINTS
// ============================================================================

export async function fetchResultsSummary(
  token: string
): Promise<SavedResultsSummary> {
  return apiRequest<SavedResultsSummary>('/results/summary', {}, token);
}

export async function saveAttemptToBackend(
  token: string,
  attempt: Attempt
): Promise<void> {
  await apiRequest(
    '/results/attempts',
    {
      method: 'POST',
      body: JSON.stringify(attempt),
    },
    token
  );
}

export async function saveSessionToBackend(
  token: string,
  session: Session
): Promise<void> {
  const item = sessionToSavedSessionItem(session);
  if (item.answeredCount === 0) return;

  await apiRequest(
    '/results/sessions',
    {
      method: 'POST',
      body: JSON.stringify(item),
    },
    token
  );
}

export async function syncGuestResultsToBackend(
  token: string,
  payload: GuestResultsBuffer
): Promise<SavedResultsSummary> {
  return apiRequest<SavedResultsSummary>(
    '/results/sync',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token
  );
}

export async function clearResultsOnBackend(token: string): Promise<void> {
  await apiRequest(
    '/results',
    {
      method: 'DELETE',
    },
    token
  );
}
