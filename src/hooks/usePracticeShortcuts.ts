'use client';

import { useEffect } from 'react';
import { soundEngine } from '@/services/sound/soundEngine';

export interface UsePracticeShortcutsParams {
  enabled: boolean;
  isMcq: boolean;
  isSubmitted: boolean;
  hasDraftAnswer: boolean;
  canGoPrev: boolean;
  canGoNext: boolean;
  onSelectOption: (label: 'A' | 'B' | 'C' | 'D') => void;
  onToggleEliminateOption: (label: 'A' | 'B' | 'C' | 'D') => void;
  onSubmitAnswer: () => void;
  onPrevQuestion: () => void;
  onNextQuestion: () => void;
  onToggleScratchpad: () => void;
  onToggleCheatSheet: () => void;
  onEscape: () => boolean; // returns true if an overlay/modal was closed
}

export function usePracticeShortcuts({
  enabled,
  isMcq,
  isSubmitted,
  hasDraftAnswer,
  canGoPrev,
  canGoNext,
  onSelectOption,
  onToggleEliminateOption,
  onSubmitAnswer,
  onPrevQuestion,
  onNextQuestion,
  onToggleScratchpad,
  onToggleCheatSheet,
  onEscape,
}: UsePracticeShortcutsParams): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Never intercept when Cmd / Ctrl / Alt is held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      const isInputFocused =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        Boolean(target?.isContentEditable);

      // Ignore all shortcuts when focused inside <input> or <textarea>
      if (isInputFocused) {
        return;
      }

      // Escape: close any open modal or scratchpad
      if (e.key === 'Escape') {
        const closed = onEscape();
        if (closed) {
          e.preventDefault();
          soundEngine.play('click');
        }
        return;
      }

      // '?': toggle keyboard shortcut cheat-sheet modal
      if (e.key === '?') {
        e.preventDefault();
        soundEngine.play('click');
        onToggleCheatSheet();
        return;
      }

      // 'S' / 's': toggle Scratchpad overlay
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        soundEngine.play('click');
        onToggleScratchpad();
        return;
      }

      // 'J' / ArrowRight: next question
      if (e.key === 'j' || e.key === 'J' || e.key === 'ArrowRight') {
        if (canGoNext) {
          e.preventDefault();
          soundEngine.play('click');
          onNextQuestion();
        }
        return;
      }

      // 'K' / ArrowLeft: previous question
      if (e.key === 'k' || e.key === 'K' || e.key === 'ArrowLeft') {
        if (canGoPrev) {
          e.preventDefault();
          soundEngine.play('click');
          onPrevQuestion();
        }
        return;
      }

      // Enter / Space: submit answer (avoid intercepting when a button or link has focus)
      if (e.key === 'Enter' || e.key === ' ') {
        if (target?.tagName === 'BUTTON' || target?.tagName === 'A') return;
        if (!isSubmitted && hasDraftAnswer) {
          e.preventDefault();
          onSubmitAnswer();
          return;
        }
        if (isSubmitted && e.key === 'Enter' && canGoNext) {
          e.preventDefault();
          soundEngine.play('click');
          onNextQuestion();
          return;
        }
      }

      // MCQ choices: A-D or 1-4 to select, Shift + A-D to toggle strikethrough
      if (isMcq && !isSubmitted) {
        const lower = e.key.toLowerCase();
        const optionMap: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          a: 'A',
          b: 'B',
          c: 'C',
          d: 'D',
          '1': 'A',
          '2': 'B',
          '3': 'C',
          '4': 'D',
        };
        const mapped = optionMap[lower];
        if (mapped) {
          e.preventDefault();
          if (e.shiftKey && ['a', 'b', 'c', 'd'].includes(lower)) {
            onToggleEliminateOption(mapped);
          } else if (!e.shiftKey) {
            onSelectOption(mapped);
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    enabled,
    isMcq,
    isSubmitted,
    hasDraftAnswer,
    canGoPrev,
    canGoNext,
    onSelectOption,
    onToggleEliminateOption,
    onSubmitAnswer,
    onPrevQuestion,
    onNextQuestion,
    onToggleScratchpad,
    onToggleCheatSheet,
    onEscape,
  ]);
}
