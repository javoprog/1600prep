'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Volume2, VolumeX } from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { soundEngine } from '@/services/sound/soundEngine';

export const TopNav: React.FC = () => {
  const pathname = usePathname();
  const {
    settings,
    updateSettings,
    activeSession,
    isSessionSummaryView,
    closeActiveSession,
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
          }}
          className="group flex items-center focus:outline-none"
        >
          <BrandLogo />
        </Link>

        {/* Right Controls: Sound Toggle */}
        <div className="flex items-center gap-1.5">
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
        </div>
      </div>
    </header>
  );
};
