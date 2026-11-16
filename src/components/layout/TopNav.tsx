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
    homeTab,
    setHomeTab,
    activeSession,
    isSessionSummaryView,
    closeActiveSession,
  } = useApp();

  // Hide the workspace navigation bar during an active exam/practice session
  if (pathname === '/' && activeSession && !isSessionSummaryView) {
    return null;
  }

  const showHomeTabs = pathname === '/' && !activeSession;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[#1F1F23] bg-[#0A0A0B]/90 backdrop-blur-md">
      <div className="relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-2.5 px-4 py-3 sm:h-16 sm:flex-nowrap sm:py-0 sm:px-6">
        {/* Editorial Brand Mark & Wordmark */}
        <Link
          href="/"
          onClick={() => {
            soundEngine.play('click');
            if (activeSession) {
              closeActiveSession();
            }
          }}
          className="order-1 group flex items-center focus:outline-none"
        >
          <BrandLogo />
        </Link>

        {/* Center Mode Switcher Tabs: Topic Practice vs Full Practice */}
        {showHomeTabs && (
          <div className="order-3 flex w-full justify-center sm:order-2 sm:w-auto sm:absolute sm:left-1/2 sm:-translate-x-1/2">
            <div
              role="tablist"
              aria-label="Practice mode"
              className="inline-flex w-full sm:w-auto items-center rounded-full border border-[#29292E] bg-[#111113] p-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={homeTab === 'topic'}
                onClick={() => {
                  soundEngine.play('click');
                  setHomeTab('topic');
                }}
                className={`flex-1 sm:flex-initial rounded-full px-4 py-1.5 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  homeTab === 'topic'
                    ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold'
                    : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                }`}
              >
                Topic Practice
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={homeTab === 'full'}
                onClick={() => {
                  soundEngine.play('click');
                  setHomeTab('full');
                }}
                className={`flex-1 sm:flex-initial rounded-full px-4 py-1.5 text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  homeTab === 'full'
                    ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold'
                    : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                }`}
              >
                Full Practice
              </button>
            </div>
          </div>
        )}

        {/* Right Controls: Sound Toggle */}
        <div className="order-2 sm:order-3 flex items-center gap-1.5">
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
