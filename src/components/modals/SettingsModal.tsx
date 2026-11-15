'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button3D } from '@/components/ui/Button3D';
import { DifficultyCode } from '@/types';
import { soundEngine } from '@/services/sound/soundEngine';

const QUESTION_COUNT_PRESETS = [5, 10, 15, 20, 27];
const DIFFICULTY_OPTIONS: Array<{ id: DifficultyCode; label: string }> = [
  { id: 'E', label: 'Easy' },
  { id: 'M', label: 'Medium' },
  { id: 'H', label: 'Hard' },
];

export const SettingsModal: React.FC = () => {
  const {
    isSettingsOpen,
    setIsSettingsOpen,
    settings,
    updateSettings,
    clearProgress,
    attempts,
    sessions,
    bookmarks,
  } = useApp();

  const [confirmClear, setConfirmClear] = useState(false);
  const [clearedMessage, setClearedMessage] = useState(false);

  if (!isSettingsOpen) return null;

  const handleClearConfirm = async () => {
    await clearProgress();
    setConfirmClear(false);
    setClearedMessage(true);
    setTimeout(() => setClearedMessage(false), 3000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      onClick={() => {
        setConfirmClear(false);
        setIsSettingsOpen(false);
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#29292E] bg-[#111113] p-6 sm:p-7 shadow-2xl text-[#F5F5F5]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#1F1F23] pb-4">
          <div>
            <h2 className="font-editorial text-2xl text-[#F5F5F5] leading-tight">
              Preferences
            </h2>
            <p className="mt-0.5 text-xs text-[#A1A1AA]">
              Audio feedback, session defaults, and local practice records
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              soundEngine.play('click');
              setConfirmClear(false);
              setIsSettingsOpen(false);
            }}
            className="rounded-lg p-1.5 text-[#71717A] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="mt-6 space-y-6 max-h-[70vh] overflow-y-auto pr-1">
          {/* Audio Feedback */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {settings.soundEnabled ? (
                  <Volume2 className="h-4 w-4 text-[#F5F5F5]" />
                ) : (
                  <VolumeX className="h-4 w-4 text-[#71717A]" />
                )}
                <div>
                  <div className="text-sm font-medium text-[#F5F5F5]">
                    Sound Effects
                  </div>
                  <div className="text-xs text-[#71717A]">
                    Subtle acoustic feedback for interactions and answers
                  </div>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.soundEnabled}
                onClick={() => {
                  const next = !settings.soundEnabled;
                  updateSettings({ soundEnabled: next });
                  if (next) {
                    setTimeout(() => soundEngine.play('select'), 30);
                  }
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border border-[#29292E] transition-colors duration-150 ${
                  settings.soundEnabled ? 'bg-[#69ff00]' : 'bg-[#18181B]'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 mt-0.5 transform rounded-full transition duration-150 ${
                    settings.soundEnabled
                      ? 'translate-x-5 bg-[#0A0A0B]'
                      : 'translate-x-1 bg-[#71717A]'
                  }`}
                />
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-[#A1A1AA] mb-1.5">
                <span>Volume</span>
                <span className="tabular-nums font-medium text-[#F5F5F5]">
                  {Math.round(settings.soundVolume * 100)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                disabled={!settings.soundEnabled}
                value={settings.soundVolume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  updateSettings({ soundVolume: val });
                  soundEngine.play('select');
                }}
                className="w-full accent-[#69ff00] cursor-pointer disabled:opacity-40"
              />
            </div>
          </div>

          <div className="h-px bg-[#1F1F23]" />

          {/* Default Session Setup */}
          <div className="space-y-4">
            <div className="text-sm font-medium text-[#F5F5F5]">
              Default Session Configuration
            </div>

            {/* Default Difficulty (Multi-select) */}
            <div>
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-[#A1A1AA]">Default Difficulty</span>
                <span className="text-[#F5F5F5]">
                  {(settings.defaultDifficulties?.length || 3) === 3
                    ? 'All Difficulties'
                    : DIFFICULTY_OPTIONS.filter((o) =>
                        (settings.defaultDifficulties || ['E', 'M', 'H']).includes(o.id)
                      )
                        .map((o) => o.label)
                        .join(' + ')}
                </span>
              </div>
              <div className="inline-flex w-full rounded-xl border border-[#29292E] bg-[#18181B] p-1 gap-1">
                {DIFFICULTY_OPTIONS.map((d) => {
                  const currentList = settings.defaultDifficulties || [
                    'E',
                    'M',
                    'H',
                  ];
                  const isSelected = currentList.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => {
                        soundEngine.play('select');
                        if (isSelected && currentList.length === 1) {
                          return;
                        }
                        const next = isSelected
                          ? currentList.filter((item) => item !== d.id)
                          : [...currentList, d.id];
                        updateSettings({ defaultDifficulties: next });
                      }}
                      className={`flex-1 rounded-lg py-2 px-2.5 text-xs font-medium transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold shadow-sm'
                          : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Default Question Count */}
            <div>
              <label className="block text-xs text-[#A1A1AA] mb-2">
                Default Question Count
              </label>
              <div className="inline-flex w-full rounded-xl border border-[#29292E] bg-[#18181B] p-1 gap-1">
                {QUESTION_COUNT_PRESETS.map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      soundEngine.play('select');
                      updateSettings({ defaultQuestionCount: cnt });
                    }}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium tabular-nums transition-all duration-150 cursor-pointer ${
                      settings.defaultQuestionCount === cnt
                        ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold shadow-sm'
                        : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                    }`}
                  >
                    {cnt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-px bg-[#1F1F23]" />

          {/* Local Storage & Reset Section */}
          <div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-[#F5F5F5]">
                  Local Practice Records
                </div>
                <div className="text-xs text-[#71717A] mt-0.5">
                  {attempts.length} attempts • {sessions.length} sessions •{' '}
                  {bookmarks.length} bookmarks
                </div>
              </div>

              {!confirmClear ? (
                <Button3D
                  variant="secondary"
                  size="sm"
                  onClick={() => setConfirmClear(true)}
                  className="text-red-300 hover:text-red-200"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Reset Data</span>
                </Button3D>
              ) : null}
            </div>

            {confirmClear && (
              <div className="mt-3 rounded-xl bg-[#201214] border border-[#4C2024] p-3.5">
                <div className="flex items-start gap-2.5 text-xs text-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    Permanently delete all recorded attempts, sessions, and bookmarks?
                    Cached SAT questions will remain stored locally for fast loading.
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button3D
                    variant="secondary"
                    size="sm"
                    onClick={() => setConfirmClear(false)}
                  >
                    Cancel
                  </Button3D>
                  <Button3D
                    variant="danger"
                    size="sm"
                    onClick={handleClearConfirm}
                  >
                    Confirm Reset
                  </Button3D>
                </div>
              </div>
            )}

            {clearedMessage && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
                <Check className="h-4 w-4" />
                <span>Practice records and bookmarks have been cleared.</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end border-t border-[#1F1F23] pt-4">
          <Button3D
            variant="primary"
            size="md"
            onClick={() => {
              setConfirmClear(false);
              setIsSettingsOpen(false);
            }}
          >
            Done
          </Button3D>
        </div>
      </div>
    </div>
  );
};
