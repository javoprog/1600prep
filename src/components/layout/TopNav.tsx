'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { User, Volume2, VolumeX } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { soundEngine } from '@/services/sound/soundEngine';

export const TopNav: React.FC = () => {
  const pathname = usePathname();
  const {
    settings,
    updateSettings,
    user,
    savedResults,
    openAuthModal,
    activeSession,
    isSessionSummaryView,
    closeActiveSession,
    triggerWizardReset,
  } = useApp();

  // Hide the workspace navigation bar during an active exam session so the exam screen has its own dedicated environment
  if (pathname === '/' && activeSession && !isSessionSummaryView) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 h-16 w-full border-b border-[#1F1F23] bg-[#0A0A0B]/90 backdrop-blur-md">
      <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Editorial Brand Mark & Wordmark */}
        <Link
          href="/"
          onClick={() => {
            soundEngine.play('click');
            if (activeSession) {
              closeActiveSession();
            }
            triggerWizardReset();
            if (typeof window !== 'undefined') {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }}
          className="group flex items-center rounded-lg focus-visible:outline-2 focus-visible:outline-[#69ff00] focus-visible:outline-offset-4"
        >
          <BrandLogo />
        </Link>

        {/* Right Controls: Sound Toggle + Optional Auth / Saved Results */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={
              settings.soundEnabled
                ? 'Mute sound effects'
                : 'Enable sound effects'
            }
            title={
              settings.soundEnabled
                ? 'Sound effects: On'
                : 'Sound effects: Off'
            }
            onMouseEnter={() => soundEngine.play('hover')}
            onClick={() => {
              const nextState = !settings.soundEnabled;
              updateSettings({ soundEnabled: nextState });
              if (nextState) {
                setTimeout(() => soundEngine.play('click'), 20);
              }
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#A1A1AA] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
          >
            {settings.soundEnabled ? (
              <Volume2 className="h-4 w-4 text-[#F5F5F5]" />
            ) : (
              <VolumeX className="h-4 w-4 text-[#71717A]" />
            )}
          </button>

          {user ? (
            <button
              type="button"
              onMouseEnter={() => soundEngine.play('hover')}
              onClick={() => {
                soundEngine.play('click');
                openAuthModal('results');
              }}
              className="flex h-8 items-center gap-2 rounded-full border border-[#29292E] bg-[#111113] px-3 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] hover:bg-[#18181B] transition-colors cursor-pointer"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#69ff00]" />
              <span className="max-w-[120px] truncate">{user.name}</span>
              {savedResults && savedResults.totalAttempts > 0 && (
                <span className="font-mono text-[11px] text-[#A1A1AA]">
                  {savedResults.accuracyPercent}%
                </span>
              )}
            </button>
          ) : (
            <button
              type="button"
              onMouseEnter={() => soundEngine.play('hover')}
              onClick={() => {
                soundEngine.play('click');
                openAuthModal('auth');
              }}
              className="flex h-8 items-center gap-1.5 rounded-full border border-[#29292E] bg-[#111113] px-3 text-xs font-medium text-[#A1A1AA] hover:border-[#3F3F46] hover:bg-[#18181B] hover:text-[#F5F5F5] transition-colors cursor-pointer"
            >
              <User className="h-3.5 w-3.5" />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
