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
  canUseScratchpad?: boolean;
  isScratchpadOpen?: boolean;
  onSelectOption: (label: 'A' | 'B' | 'C' | 'D') => void;
  onToggleEliminateOption: (label: 'A' | 'B' | 'C' | 'D') => void;
  onSubmitAnswer: () => void;
  onPrevQuestion: () => void;
  onNextQuestion: () => void;
  onToggleScratchpad: () => void;
  onEscape: () => boolean; // returns true if an overlay/modal was closed
}

export function usePracticeShortcuts({
  enabled,
  isMcq,
  isSubmitted,
  hasDraftAnswer,
  canGoPrev,
  canGoNext,
  canUseScratchpad = true,
  isScratchpadOpen = false,
  onSelectOption,
  onToggleEliminateOption,
  onSubmitAnswer,
  onPrevQuestion,
  onNextQuestion,
  onToggleScratchpad,
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
          soundEngine.play('toggleClose');
        }
        return;
      }

      // 'S' / 's': toggle Scratchpad overlay (desktop/tablet viewports only)
      if (e.key === 's' || e.key === 'S') {
        if (!canUseScratchpad) return;
        e.preventDefault();
        onToggleScratchpad();
        return;
      }

      // ArrowRight: next question
      if (e.key === 'ArrowRight') {
        if (canGoNext) {
          e.preventDefault();
          soundEngine.play('navigate');
          onNextQuestion();
        }
        return;
      }

      // ArrowLeft: previous question
      if (e.key === 'ArrowLeft') {
        if (canGoPrev) {
          e.preventDefault();
          soundEngine.play('navigate');
          onPrevQuestion();
        }
        return;
      }

      // Enter / Space: submit answer (avoid intercepting when an interactive control has focus)
      if (e.key === 'Enter' || e.key === ' ') {
        if (target?.closest('button, a, [role="button"]')) return;
        if (!isSubmitted && hasDraftAnswer) {
          e.preventDefault();
          onSubmitAnswer();
          return;
        }
        if (isSubmitted && e.key === 'Enter' && canGoNext) {
          e.preventDefault();
          soundEngine.play('navigate');
          onNextQuestion();
          return;
        }
      }

      // MCQ choices: A-D or 1-4 to select, Shift + A-D or Shift + 1-4 to toggle strikethrough
      // Disabled while scratchpad overlay is open so keys like C (clear) or B (board) never toggle answers
      if (isMcq && !isSubmitted && !isScratchpadOpen) {
        const codeMap: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          KeyA: 'A',
          KeyB: 'B',
          KeyC: 'C',
          KeyD: 'D',
          Digit1: 'A',
          Digit2: 'B',
          Digit3: 'C',
          Digit4: 'D',
        };
        const keyMap: Record<string, 'A' | 'B' | 'C' | 'D'> = {
          a: 'A',
          b: 'B',
          c: 'C',
          d: 'D',
          '1': 'A',
          '2': 'B',
          '3': 'C',
          '4': 'D',
          '!': 'A',
          '@': 'B',
          '#': 'C',
          $: 'D',
        };
        const mapped = codeMap[e.code] || keyMap[e.key.toLowerCase()];
        if (mapped) {
          e.preventDefault();
          if (e.shiftKey) {
            onToggleEliminateOption(mapped);
          } else {
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
    canUseScratchpad,
    isScratchpadOpen,
    onSelectOption,
    onToggleEliminateOption,
    onSubmitAnswer,
    onPrevQuestion,
    onNextQuestion,
    onToggleScratchpad,
    onEscape,
  ]);
}
