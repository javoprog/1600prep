'use client';

import React from 'react';
import {
  AlertCircle,
  Loader2,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { Button3D } from '@/components/ui/Button3D';
import { PracticeWizard } from '@/components/practice/PracticeWizard';

export const PracticeHome: React.FC = () => {
  const {
    taxonomy,
    isCatalogLoading,
    catalogError,
    isOfflineFallback,
    offlineWarning,
    reloadCatalog,
  } = useApp();

  if (isCatalogLoading && !taxonomy) {
    return (
      <div
        key="catalog-loading"
        className="mx-auto max-w-4xl px-4 py-28 sm:px-6 flex flex-col items-center justify-center text-center animate-page-in"
      >
        <Loader2 className="h-6 w-6 animate-spin text-[#69ff00]" />
        <h2 className="mt-4 font-editorial text-2xl text-[#F5F5F5]">
          Loading SAT Question Bank
        </h2>
        <p className="mt-1.5 text-xs text-[#71717A] max-w-sm">
          Synchronizing official College Board Digital SAT domains, skills, and
          items...
        </p>
      </div>
    );
  }

  if (catalogError && !taxonomy) {
    return (
      <div
        key="catalog-error"
        className="mx-auto max-w-lg px-4 py-24 sm:px-6 animate-page-in"
      >
        <div className="rounded-2xl border border-[#4C2024] bg-[#111113] p-8 text-center">
          <AlertCircle className="mx-auto h-8 w-8 text-red-400" />
          <h2 className="mt-4 font-editorial text-2xl text-[#F5F5F5]">
            Question Bank Unavailable
          </h2>
          <p className="mt-2 text-xs text-[#A1A1AA] leading-relaxed">
            {catalogError}
          </p>
          <div className="mt-6 flex justify-center">
            <Button3D variant="primary" onClick={() => reloadCatalog(true)}>
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry Connection</span>
            </Button3D>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      key="catalog-ready"
      className="mx-auto max-w-4xl px-4 py-10 sm:px-6 animate-page-in"
    >
      {/* Offline Warning Banner */}
      {isOfflineFallback && offlineWarning && (
        <div className="mb-8 mx-auto max-w-3xl flex items-center justify-between gap-4 rounded-2xl border border-[#29292E] bg-[#111113] px-4 py-3 text-xs text-[#F5F5F5]">
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-4 w-4 shrink-0 text-white" />
            <span>{offlineWarning}</span>
          </div>
          <Button3D
            variant="secondary"
            size="sm"
            onClick={() => reloadCatalog(true)}
          >
            <RefreshCw className="h-3 w-3" />
            <span>Reconnect</span>
          </Button3D>
        </div>
      )}

      {/* Default 2-Step Practice Setup Wizard */}
      <PracticeWizard />
    </div>
  );
};
