'use client';

import React from 'react';
import { useApp } from '@/context/AppContext';
import { PracticeHome } from '@/components/practice/PracticeHome';
import { QuestionSolver } from '@/components/session/QuestionSolver';
import { SessionSummary } from '@/components/session/SessionSummary';

export default function HomePage() {
  const { activeSession, isSessionSummaryView } = useApp();

  if (activeSession) {
    if (isSessionSummaryView) {
      return <SessionSummary />;
    }
    return <QuestionSolver />;
  }

  return <PracticeHome />;
}
