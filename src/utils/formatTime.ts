export function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

export function formatShortDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

export function formatDateTime(epochMs: number): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(epochMs));
  } catch {
    return new Date(epochMs).toLocaleString();
  }
}

export function getDifficultyBadgeInfo(difficulty?: 'E' | 'M' | 'H' | null): {
  label: string;
  className: string;
  dotColor: string;
} {
  if (difficulty === 'E') {
    return {
      label: 'Easy',
      className: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
      dotColor: 'bg-emerald-400',
    };
  }
  if (difficulty === 'M') {
    return {
      label: 'Medium',
      className: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
      dotColor: 'bg-amber-400',
    };
  }
  if (difficulty === 'H') {
    return {
      label: 'Hard',
      className: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
      dotColor: 'bg-rose-400',
    };
  }
  return {
    label: 'Standard',
    className: 'bg-[#18181B] text-[#71717A] border-[#29292E]',
    dotColor: 'bg-[#71717A]',
  };
}
