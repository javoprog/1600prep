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
      <div
        className={`relative mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-1.5 px-4 sm:h-16 sm:flex-nowrap sm:py-0 sm:px-6 ${
          showHomeTabs ? 'pt-2.5 pb-0' : 'py-2.5'
        }`}
      >
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

        {/* Center Header Navigation Tabs: Topic Practice vs Full Practice */}
        {showHomeTabs && (
          <nav
            role="tablist"
            aria-label="Practice mode"
            className="order-3 flex w-full items-center justify-center gap-7 sm:order-2 sm:w-auto sm:h-full sm:gap-8 sm:absolute sm:left-1/2 sm:-translate-x-1/2"
          >
            {[
              { id: 'topic' as const, label: 'Topic Practice' },
              { id: 'full' as const, label: 'Full Practice' },
            ].map((tab) => {
              const isActive = homeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onMouseEnter={() => soundEngine.play('hover')}
                  onClick={() => {
                    if (!isActive) {
                      soundEngine.play('click');
                    }
                    setHomeTab(tab.id);
                  }}
                  className={`relative flex items-center justify-center pt-1 pb-2.5 sm:h-full sm:py-0 text-sm font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'text-[#F5F5F5]'
                      : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                  }`}
                >
                  <span>{tab.label}</span>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] rounded-full bg-[#69ff00]"
                    />
                  )}
                </button>
              );
            })}
          </nav>
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
