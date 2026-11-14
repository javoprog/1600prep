import { DifficultyCode, UserSettings } from '@/types';

const SETTINGS_KEY = '1600prep_settings_v1';
const ACTIVE_SESSION_KEY = '1600prep_active_session_v1';

export const DEFAULT_USER_SETTINGS: UserSettings = {
  soundEnabled: true,
  soundVolume: 1.0,
  defaultDifficulties: ['E', 'M', 'H'],
  defaultDifficulty: 'ALL',
  defaultQuestionCount: 10,
  defaultRepetitionFilter: 'all',
  defaultNewRatio: 100,
};

export function loadUserSettings(): UserSettings {
  if (typeof window === 'undefined') return DEFAULT_USER_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_USER_SETTINGS;
    const parsed = JSON.parse(raw);

    let defaultDifficulties: DifficultyCode[] = ['E', 'M', 'H'];
    if (
      Array.isArray(parsed.defaultDifficulties) &&
      parsed.defaultDifficulties.length > 0
    ) {
      const valid = parsed.defaultDifficulties.filter(
        (d: string): d is DifficultyCode => d === 'E' || d === 'M' || d === 'H'
      );
      if (valid.length > 0) {
        defaultDifficulties = valid;
      }
    } else if (
      parsed.defaultDifficulty === 'E' ||
      parsed.defaultDifficulty === 'M' ||
      parsed.defaultDifficulty === 'H'
    ) {
      defaultDifficulties = [parsed.defaultDifficulty];
    }

    return {
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_USER_SETTINGS.soundEnabled,
      soundVolume:
        typeof parsed.soundVolume === 'number'
          ? parsed.soundVolume
          : DEFAULT_USER_SETTINGS.soundVolume,
      defaultDifficulties,
      defaultDifficulty:
        parsed.defaultDifficulty || DEFAULT_USER_SETTINGS.defaultDifficulty,
      defaultQuestionCount:
        typeof parsed.defaultQuestionCount === 'number'
          ? parsed.defaultQuestionCount
          : DEFAULT_USER_SETTINGS.defaultQuestionCount,
      defaultRepetitionFilter:
        parsed.defaultRepetitionFilter ||
        DEFAULT_USER_SETTINGS.defaultRepetitionFilter,
      defaultNewRatio:
        typeof parsed.defaultNewRatio === 'number'
          ? parsed.defaultNewRatio
          : DEFAULT_USER_SETTINGS.defaultNewRatio,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
  }
}

export function saveUserSettings(settings: UserSettings): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (err) {
    console.warn('Failed to save settings to localStorage:', err);
  }
}

export function getActiveSessionId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(ACTIVE_SESSION_KEY);
  } catch {
    return null;
  }
}

export function setActiveSessionId(sessionId: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionId) {
      window.localStorage.setItem(ACTIVE_SESSION_KEY, sessionId);
    } else {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    }
  } catch (err) {
    console.warn('Failed to set active session id:', err);
  }
}
