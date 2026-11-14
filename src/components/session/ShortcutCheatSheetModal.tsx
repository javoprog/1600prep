'use client';

import React from 'react';
import { X } from 'lucide-react';
import { soundEngine } from '@/services/sound/soundEngine';

interface ShortcutCheatSheetModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUT_ITEMS: Array<{
  keys: string[];
  description: string;
}> = [
  {
    keys: ['A–D', '/', '1–4'],
    description: 'Select answer choice',
  },
  {
    keys: ['Shift', '+', 'A–D', '/', '1–4'],
    description: 'Toggle strikethrough on an option',
  },
  {
    keys: ['Enter', '/', 'Space'],
    description: 'Submit selected answer',
  },
  {
    keys: ['→'],
    description: 'Next question',
  },
  {
    keys: ['←'],
    description: 'Previous question',
  },
  {
    keys: ['S'],
    description: 'Toggle Scratchpad overlay',
  },
  {
    keys: ['Z', '/', 'C'],
    description: 'Undo stroke / Clear scratchpad (when open)',
  },
  {
    keys: ['?'],
    description: 'Toggle keyboard shortcuts cheat-sheet',
  },
  {
    keys: ['Esc'],
    description: 'Close active modal or scratchpad',
  },
];

export const ShortcutCheatSheetModal: React.FC<ShortcutCheatSheetModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0B]/75 backdrop-blur-sm p-4"
      onClick={() => {
        soundEngine.play('toggleClose');
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-[#29292E] bg-[#111113] p-6 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1F1F23] pb-4">
          <div>
            <p className="text-[11px] font-mono uppercase tracking-wider text-[#71717A]">
              Workspace Controls
            </p>
            <h2 className="mt-0.5 font-editorial text-2xl text-[#F5F5F5]">
              Keyboard Shortcuts
            </h2>
          </div>

          <button
            type="button"
            onClick={() => {
              soundEngine.play('toggleClose');
              onClose();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#71717A] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            title="Close"
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 divide-y divide-[#1F1F23]">
          {SHORTCUT_ITEMS.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between gap-4 py-2.5 text-xs"
            >
              <span className="text-[#A1A1AA]">{item.description}</span>

              <div className="flex items-center gap-1 shrink-0">
                {item.keys.map((k, kIdx) =>
                  k === '+' || k === '/' ? (
                    <span
                      key={kIdx}
                      className="px-0.5 font-mono text-[10px] text-[#52525B]"
                    >
                      {k}
                    </span>
                  ) : (
                    <kbd
                      key={kIdx}
                      className="inline-flex h-5 min-w-[1.35rem] items-center justify-center rounded border border-[#29292E] bg-[#18181B] px-1.5 font-mono text-[11px] text-[#F4F0EA]"
                    >
                      {k}
                    </kbd>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 border-t border-[#1F1F23] pt-3 text-[11px] text-[#71717A] flex items-center justify-between">
          <span>Shortcuts are paused while typing in answer inputs</span>
          <span className="font-mono text-[#71717A]">Press ? or Esc</span>
        </div>
      </div>
    </div>
  );
};
