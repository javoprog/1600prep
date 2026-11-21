'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Loader2,
  Minus,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import {
  DifficultyCode,
  PracticeFilters,
  PracticeMode,
  SubjectCode,
} from '@/types';
import { Button3D } from '@/components/ui/Button3D';
import { soundEngine } from '@/services/sound/soundEngine';

type WizardStep = 1 | 2;

const SESSION_LENGTH_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 20, label: '20' },
  { value: 30, label: '30' },
  { value: 0, label: 'All' },
];

const DIFFICULTY_OPTIONS: Array<{
  id: DifficultyCode;
  label: string;
  description: string;
  dotColor: string;
}> = [
  {
    id: 'E',
    label: 'Easy',
    description: 'Foundational concepts & direct application',
    dotColor: 'bg-emerald-400',
  },
  {
    id: 'M',
    label: 'Medium',
    description: 'Standard Digital SAT exam complexity',
    dotColor: 'bg-amber-400',
  },
  {
    id: 'H',
    label: 'Hard',
    description: 'Multi-step reasoning & upper score band',
    dotColor: 'bg-rose-400',
  },
];

const ORDERED_DIFFICULTIES: DifficultyCode[] = ['E', 'M', 'H'];

export function formatDifficultySelectionLabel(
  selected: DifficultyCode[]
): string {
  if (selected.length === 0) {
    return 'None selected';
  }
  if (selected.length === 3) {
    return 'All Difficulties';
  }
  const ordered = ORDERED_DIFFICULTIES.filter((d) => selected.includes(d));
  const labels = ordered.map(
    (code) => DIFFICULTY_OPTIONS.find((o) => o.id === code)?.label || code
  );
  return labels.join(' + ');
}

export const PracticeWizard: React.FC = () => {
  const {
    metas,
    taxonomy,
    startPracticeSession,
    wizardResetToken,
    settings,
    updateSettings,
  } = useApp();

  const [step, setStep] = useState<WizardStep>(1);
  const [stepDirection, setStepDirection] = useState<'none' | 'forward' | 'backward'>('none');
  const [subject, setSubject] = useState<SubjectCode>('rw');
  const stepRef = useRef<WizardStep>(step);
  stepRef.current = step;
  const lastResetTokenRef = useRef<number>(wizardResetToken);

  const navigateToStep = (target: WizardStep) => {
    if (target === step) return;
    setStepDirection(target > step ? 'forward' : 'backward');
    setStep(target);
  };

  useEffect(() => {
    if (wizardResetToken === lastResetTokenRef.current) return;
    lastResetTokenRef.current = wizardResetToken;
    setStartError(null);
    if (stepRef.current !== 1) {
      setStepDirection('backward');
      setStep(1);
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [wizardResetToken]);
  const [selectedDomains, setSelectedDomains] = useState<string[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // Multi-select difficulties: default to all 3 ['E', 'M', 'H']
  const [selectedDifficulties, setSelectedDifficulties] = useState<
    DifficultyCode[]
  >(['E', 'M', 'H']);
  const [questionCountLimit, setQuestionCountLimit] = useState<number>(
    settings.defaultQuestionCount || 0
  );

  useEffect(() => {
    const valid = SESSION_LENGTH_OPTIONS.some(
      (opt) => opt.value === settings.defaultQuestionCount
    );
    setQuestionCountLimit(valid ? settings.defaultQuestionCount : 0);
  }, [settings.defaultQuestionCount]);

  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [startError, setStartError] = useState<string | null>(null);

  const currentSubjectDomains = useMemo(() => {
    if (!taxonomy) return [];
    return subject === 'rw' ? taxonomy.rw : taxonomy.math;
  }, [taxonomy, subject]);

  const rwTotalCount = useMemo(() => {
    if (!taxonomy) return 0;
    return taxonomy.rw.reduce((acc, d) => acc + d.questionCount, 0);
  }, [taxonomy]);

  const mathTotalCount = useMemo(() => {
    if (!taxonomy) return 0;
    return taxonomy.math.reduce((acc, d) => acc + d.questionCount, 0);
  }, [taxonomy]);

  const handleSubjectSelect = (nextSubject: SubjectCode) => {
    soundEngine.play('select');
    if (nextSubject !== subject) {
      setSubject(nextSubject);
      setSelectedDomains([]);
      setSelectedSkills([]);
      setStartError(null);
    }
  };

  // Questions matching the selected subject and selected skills (before difficulty filter)
  const skillMatchingMetas = useMemo(() => {
    if (selectedSkills.length === 0) return [];
    return metas.filter((m) => {
      if (m.subject !== subject) return false;
      return (
        selectedSkills.includes(m.skill) ||
        selectedSkills.includes(m.skillLabel)
      );
    });
  }, [metas, subject, selectedSkills]);

  // Count per difficulty level for the selected skills
  const difficultyCounts = useMemo(() => {
    const counts: Record<DifficultyCode, number> = { E: 0, M: 0, H: 0 };
    if (selectedSkills.length === 0) return counts;
    for (const m of skillMatchingMetas) {
      if (m.difficulty && counts[m.difficulty] !== undefined) {
        counts[m.difficulty] += 1;
      }
    }
    return counts;
  }, [selectedSkills.length, skillMatchingMetas]);

  // Total matching questions for selected skills + selected difficulties
  const maxAvailableQuestions = useMemo(() => {
    if (selectedSkills.length === 0 || selectedDifficulties.length === 0) {
      return 0;
    }
    if (selectedDifficulties.length === 3) {
      return skillMatchingMetas.length;
    }
    return skillMatchingMetas.filter(
      (m) => m.difficulty && selectedDifficulties.includes(m.difficulty)
    ).length;
  }, [selectedSkills.length, selectedDifficulties, skillMatchingMetas]);

  const allSelectableSkillCodes = useMemo(() => {
    const codes: string[] = [];
    for (const dom of currentSubjectDomains) {
      for (const sk of dom.skills) {
        if (sk.questionCount > 0) {
          codes.push(sk.code);
        }
      }
    }
    return codes;
  }, [currentSubjectDomains]);

  const isAllSubjectSkillsSelected =
    allSelectableSkillCodes.length > 0 &&
    allSelectableSkillCodes.every((code) => selectedSkills.includes(code));

  const handleToggleAllSubjectSkills = () => {
    setStartError(null);
    if (isAllSubjectSkillsSelected) {
      soundEngine.play('deselect');
      setSelectedDomains([]);
      setSelectedSkills([]);
    } else {
      soundEngine.play('select');
      setSelectedDomains(
        currentSubjectDomains
          .filter((d) => d.skills.some((s) => s.questionCount > 0))
          .map((d) => d.primaryClassCd)
      );
      setSelectedSkills(allSelectableSkillCodes);
    }
  };

  const effectiveSessionCount = useMemo(() => {
    if (maxAvailableQuestions === 0) return 0;
    if (questionCountLimit > 0) {
      return Math.min(questionCountLimit, maxAvailableQuestions);
    }
    return maxAvailableQuestions;
  }, [maxAvailableQuestions, questionCountLimit]);

  const currentFilters: PracticeFilters = useMemo(
    () => ({
      subject,
      domains: selectedDomains,
      skills: selectedSkills,
      difficulties: selectedDifficulties,
      difficulty:
        selectedDifficulties.length === 1 ? selectedDifficulties[0] : 'ALL',
      questionCount: questionCountLimit > 0 ? questionCountLimit : undefined,
    }),
    [
      subject,
      selectedDomains,
      selectedSkills,
      selectedDifficulties,
      questionCountLimit,
    ]
  );

  const toggleDomain = (domainCode: string) => {
    setStartError(null);
    const domainObj = currentSubjectDomains.find(
      (d) => d.primaryClassCd === domainCode
    );
    const domainSkillCodes = domainObj
      ? domainObj.skills.filter((s) => s.questionCount > 0).map((s) => s.code)
      : [];

    const allSkillsInDomainSelected =
      domainSkillCodes.length > 0 &&
      domainSkillCodes.every((code) => selectedSkills.includes(code));

    if (allSkillsInDomainSelected && selectedDomains.includes(domainCode)) {
      soundEngine.play('deselect');
      setSelectedDomains((prev) => prev.filter((d) => d !== domainCode));
      setSelectedSkills((skPrev) =>
        skPrev.filter((sk) => !domainSkillCodes.includes(sk))
      );
    } else {
      soundEngine.play('select');
      setSelectedDomains((prev) =>
        prev.includes(domainCode) ? prev : [...prev, domainCode]
      );
      setSelectedSkills((skPrev) =>
        Array.from(new Set([...skPrev, ...domainSkillCodes]))
      );
    }
  };

  const toggleSkill = (skillCode: string, domainCode: string) => {
    setStartError(null);
    const domainObj = currentSubjectDomains.find(
      (d) => d.primaryClassCd === domainCode
    );
    const domainSkillCodes = domainObj
      ? domainObj.skills.map((s) => s.code)
      : [];

    const exists = selectedSkills.includes(skillCode);
    soundEngine.play(exists ? 'deselect' : 'select');
    const nextSkills = exists
      ? selectedSkills.filter((s) => s !== skillCode)
      : [...selectedSkills, skillCode];

    setSelectedSkills(nextSkills);

    const hasAnySkillInDomain = domainSkillCodes.some((code) =>
      nextSkills.includes(code)
    );
    if (hasAnySkillInDomain) {
      setSelectedDomains((dPrev) =>
        dPrev.includes(domainCode) ? dPrev : [...dPrev, domainCode]
      );
    } else {
      setSelectedDomains((dPrev) => dPrev.filter((d) => d !== domainCode));
    }
  };

  const handleToggleDifficulty = (diffCode: DifficultyCode) => {
    setStartError(null);
    setSelectedDifficulties((prev) => {
      const isSelected = prev.includes(diffCode);
      soundEngine.play(isSelected ? 'deselect' : 'select');
      if (isSelected) {
        return ORDERED_DIFFICULTIES.filter(
          (d) => d !== diffCode && prev.includes(d)
        );
      } else {
        return ORDERED_DIFFICULTIES.filter(
          (d) => d === diffCode || prev.includes(d)
        );
      }
    });
  };

  // Must have at least 1 skill AND at least 1 difficulty selected
  const hasValidSelection =
    selectedSkills.length > 0 && selectedDifficulties.length > 0;

  const canStartSession =
    !isStarting && hasValidSelection && maxAvailableQuestions > 0;

  const handleStartPractice = async () => {
    if (!canStartSession) return;
    setStartError(null);
    setIsStarting(true);

    try {
      const mode: PracticeMode = 'custom';
      const subjLabel = subject === 'rw' ? 'Reading & Writing' : 'Math';
      let title = `${subjLabel} Practice`;

      const activeDoms = currentSubjectDomains.filter((d) =>
        selectedDomains.includes(d.primaryClassCd)
      );
      const allSkillsInActiveDomsSelected =
        activeDoms.length > 0 &&
        activeDoms.every((d) =>
          d.skills.every((s) => selectedSkills.includes(s.code))
        );

      if (allSkillsInActiveDomsSelected) {
        if (activeDoms.length === 1) {
          title = activeDoms[0].text;
        } else if (activeDoms.length < currentSubjectDomains.length) {
          title = `${subjLabel} (${activeDoms.length} Domains)`;
        }
      } else if (selectedSkills.length === 1) {
        for (const d of currentSubjectDomains) {
          const sk = d.skills.find((s) => s.code === selectedSkills[0]);
          if (sk) {
            title = sk.text;
            break;
          }
        }
      } else if (selectedSkills.length > 1) {
        title = `${subjLabel} (${selectedSkills.length} Skills)`;
      }

      soundEngine.play('select');
      await startPracticeSession(currentFilters, mode, title);
    } catch (err) {
      setStartError(
        err instanceof Error ? err.message : 'Unable to start practice session.'
      );
      setIsStarting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      {/* Subtle 2-Step Indicator Header */}
      <div className="mb-8 flex items-center justify-between border-b border-[#1F1F23] pb-4">
        <div className="flex items-center gap-3">
          {([1, 2] as WizardStep[]).map((s) => {
            const isCurrent = step === s;
            const isPast = step > s;
            const stepLabel =
              s === 1 ? 'Choose Subject' : 'Choose Focus & Difficulty';
            return (
              <React.Fragment key={s}>
                <button
                  type="button"
                  onClick={() => {
                    if (s < step) {
                      soundEngine.play('click');
                      navigateToStep(s);
                    }
                  }}
                  disabled={s > step}
                  aria-current={isCurrent ? 'step' : undefined}
                  aria-label={`${stepLabel} (Step ${s} of 2)${
                    isPast ? ' — completed' : isCurrent ? ' — current' : ''
                  }`}
                  className={`inline-flex items-center gap-2 text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'text-[#F5F5F5]'
                      : isPast
                      ? 'text-[#A1A1AA] hover:text-[#F5F5F5] cursor-pointer'
                      : 'text-[#52525B] cursor-default'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-colors ${
                      isCurrent
                        ? 'bg-[#69ff00] text-[#0A0A0B]'
                        : isPast
                        ? 'bg-[#202024] text-[#F5F5F5]'
                        : 'bg-[#141417] text-[#52525B]'
                    }`}
                  >
                    {isPast ? <Check className="h-3 w-3" /> : s}
                  </span>
                  <span className="hidden sm:inline">{stepLabel}</span>
                </button>
                {s < 2 && <span className="text-[#29292E] text-xs">/</span>}
              </React.Fragment>
            );
          })}
        </div>

        <span className="text-xs font-medium tabular-nums text-[#71717A]">
          Step {step} of 2
        </span>
      </div>

      {/* Step 1: Choose Subject */}
      {step === 1 && (
        <div
          className={`space-y-8 ${
            stepDirection === 'backward' ? 'animate-wizard-backward' : ''
          }`}
        >
          <div>
            <p className="text-xs font-medium text-[#A1A1AA]">Step 1</p>
            <h1 className="mt-1 font-editorial text-2xl sm:text-3xl text-[#F5F5F5] tracking-tight">
              What do you want to practice?
            </h1>
            <p className="mt-2 text-sm text-[#A1A1AA]">
              Choose one official Digital SAT section to begin.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Reading & Writing Card */}
            <button
              type="button"
              onClick={() => handleSubjectSelect('rw')}
              className={`group text-left rounded-2xl border p-6 transition-all duration-150 cursor-pointer ${
                subject === 'rw'
                  ? 'border-[#69ff00] bg-[#18181B]'
                  : 'border-[#29292E] bg-[#111113] hover:border-[#3F3F46] hover:bg-[#18181B]/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A1A1AA]">
                  Section 1
                </span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                    subject === 'rw'
                      ? 'border-[#69ff00] bg-[#69ff00] text-[#0A0A0B]'
                      : 'border-[#3F3F46]'
                  }`}
                >
                  {subject === 'rw' && <Check className="h-3 w-3 stroke-[2.5]" />}
                </span>
              </div>
              <h2 className="mt-4 font-editorial text-xl sm:text-2xl text-[#F5F5F5]">
                Reading &amp; Writing
              </h2>
              <p className="mt-2 text-xs text-[#A1A1AA] leading-relaxed">
                Information and Ideas, Craft and Structure, Expression of Ideas,
                and Standard English Conventions.
              </p>
              <div className="mt-6 pt-4 border-t border-[#1F1F23] flex items-center justify-between text-xs text-[#71717A]">
                <span>4 official domains</span>
                <span className="font-medium tabular-nums text-[#A1A1AA]">
                  {rwTotalCount.toLocaleString()} questions
                </span>
              </div>
            </button>

            {/* Math Card */}
            <button
              type="button"
              onClick={() => handleSubjectSelect('math')}
              className={`group text-left rounded-2xl border p-6 transition-all duration-150 cursor-pointer ${
                subject === 'math'
                  ? 'border-[#69ff00] bg-[#18181B]'
                  : 'border-[#29292E] bg-[#111113] hover:border-[#3F3F46] hover:bg-[#18181B]/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#A1A1AA]">
                  Section 2
                </span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-full border transition-colors ${
                    subject === 'math'
                      ? 'border-[#69ff00] bg-[#69ff00] text-[#0A0A0B]'
                      : 'border-[#3F3F46]'
                  }`}
                >
                  {subject === 'math' && (
                    <Check className="h-3 w-3 stroke-[2.5]" />
                  )}
                </span>
              </div>
              <h2 className="mt-4 font-editorial text-xl sm:text-2xl text-[#F5F5F5]">
                Math
              </h2>
              <p className="mt-2 text-xs text-[#A1A1AA] leading-relaxed">
                Algebra, Advanced Math, Problem-Solving and Data Analysis, and
                Geometry and Trigonometry.
              </p>
              <div className="mt-6 pt-4 border-t border-[#1F1F23] flex items-center justify-between text-xs text-[#71717A]">
                <span>4 official domains</span>
                <span className="font-medium tabular-nums text-[#A1A1AA]">
                  {mathTotalCount.toLocaleString()} questions
                </span>
              </div>
            </button>
          </div>

          <div className="flex items-center justify-end border-t border-[#1F1F23] pt-6">
            <Button3D
              variant="primary"
              size="lg"
              onClick={() => {
                soundEngine.play('click');
                navigateToStep(2);
              }}
            >
              <span>Continue</span>
              <ChevronRight className="h-4 w-4" />
            </Button3D>
          </div>
        </div>
      )}

      {/* Step 2: Choose Your Focus & Difficulty */}
      {step === 2 && (
        <div className="space-y-8 animate-wizard-forward">
          <div>
            <p className="text-xs font-medium text-[#A1A1AA]">
              Step 2 • {subject === 'rw' ? 'Reading & Writing' : 'Math'}
            </p>
            <h1 className="mt-1 font-editorial text-2xl sm:text-3xl text-[#F5F5F5] tracking-tight">
              Choose your focus &amp; difficulty
            </h1>
            <p className="mt-1.5 text-sm text-[#A1A1AA]">
              Select at least one skill and one difficulty level to start
              continuous practice.
            </p>
          </div>

          {/* Domains & Skills Selection */}
          <div className="divide-y divide-[#1F1F23] rounded-2xl border border-[#29292E] bg-[#111113]">
            <div className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
              <div className="text-xs text-[#A1A1AA]">
                <span className="font-medium text-[#F5F5F5]">
                  Domains &amp; Skills
                </span>{' '}
                <span className="text-[#71717A] tabular-nums">
                  ({selectedSkills.length} of {allSelectableSkillCodes.length}{' '}
                  selected)
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedSkills.length > 0 && !isAllSubjectSkillsSelected && (
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.play('deselect');
                      setSelectedDomains([]);
                      setSelectedSkills([]);
                      setStartError(null);
                    }}
                    className="rounded-full border border-[#29292E] bg-[#18181B] px-3 py-1 text-xs font-medium text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#F5F5F5] transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleToggleAllSubjectSkills}
                  className="rounded-full border border-[#29292E] bg-[#18181B] px-3 py-1 text-xs font-medium text-[#F5F5F5] hover:border-[#3F3F46] hover:bg-[#202024] transition-colors cursor-pointer"
                >
                  {isAllSubjectSkillsSelected ? 'Clear All' : 'Select All'}
                </button>
              </div>
            </div>

            {currentSubjectDomains.map((dom) => {
              const selectableDomSkills = dom.skills.filter(
                (s) => s.questionCount > 0
              );
              const activeSkillsInDom = selectableDomSkills.filter((s) =>
                selectedSkills.includes(s.code)
              );
              const isAllDomSkillsSelected =
                selectableDomSkills.length > 0 &&
                activeSkillsInDom.length === selectableDomSkills.length;
              const isSomeDomSkillsSelected = activeSkillsInDom.length > 0;
              const isPartiallySelected =
                isSomeDomSkillsSelected && !isAllDomSkillsSelected;

              return (
                <div key={dom.primaryClassCd} className="p-5 sm:p-6">
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={
                      isAllDomSkillsSelected
                        ? true
                        : isPartiallySelected
                        ? 'mixed'
                        : false
                    }
                    onClick={() => toggleDomain(dom.primaryClassCd)}
                    className="flex w-full items-start justify-between gap-4 rounded-xl text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#69ff00] focus-visible:outline-offset-4"
                  >
                    <div className="flex items-start gap-3.5">
                      <div
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
                          isAllDomSkillsSelected
                            ? 'border-[#69ff00] bg-[#69ff00] text-[#0A0A0B]'
                            : isPartiallySelected
                            ? 'border-[#69ff00] bg-[#18181B] text-[#69ff00]'
                            : 'border-[#3F3F46] bg-[#18181B]'
                        }`}
                      >
                        {isAllDomSkillsSelected ? (
                          <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                        ) : isPartiallySelected ? (
                          <Minus className="h-3.5 w-3.5 stroke-[2.5]" />
                        ) : null}
                      </div>
                      <div>
                        <div className="text-base font-medium text-[#F5F5F5]">
                          {dom.text}
                        </div>
                        <div className="mt-0.5 text-xs text-[#71717A] tabular-nums">
                          {dom.skills.length} skills • {dom.questionCount} questions
                        </div>
                      </div>
                    </div>
                  </button>

                  <div className="mt-4 ml-8 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dom.skills.map((sk) => {
                      const isSkSelected = selectedSkills.includes(sk.code);
                      const isZeroCount = sk.questionCount === 0;
                      return (
                        <button
                          key={sk.id}
                          type="button"
                          disabled={isZeroCount}
                          title={sk.text}
                          aria-pressed={isSkSelected}
                          onClick={() =>
                            toggleSkill(sk.code, dom.primaryClassCd)
                          }
                          className={`flex items-center justify-between gap-2 rounded-full border px-4 py-2 text-left text-xs transition-colors ${
                            isZeroCount
                              ? 'border-[#1F1F23] bg-[#0A0A0B]/60 text-[#52525B] cursor-not-allowed'
                              : isSkSelected
                              ? 'border-[#69ff00]/75 bg-[#18181B] text-[#F5F5F5] cursor-pointer'
                              : 'border-[#29292E] bg-[#0A0A0B] text-[#A1A1AA] hover:border-[#3F3F46] hover:text-[#F5F5F5] cursor-pointer'
                          }`}
                        >
                          <span className="line-clamp-1">{sk.text}</span>
                          <span className="text-xs tabular-nums text-[#71717A] shrink-0">
                            {sk.questionCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Redesigned Question Difficulty Checkboxes Section */}
          <div className="rounded-2xl border border-[#29292E] bg-[#111113] p-5 sm:p-6">
            <div className="mb-4">
              <h2 className="text-base font-medium text-[#F5F5F5]">
                Question Difficulty
              </h2>
              <p className="text-xs text-[#71717A] mt-0.5">
                Select one or more difficulty tiers to include in your session
              </p>
            </div>

            <div
              role="group"
              aria-label="Difficulty levels"
              className="grid grid-cols-1 sm:grid-cols-3 gap-3"
            >
              {DIFFICULTY_OPTIONS.map((d) => {
                const isSelected = selectedDifficulties.includes(d.id);
                const countForDiff = difficultyCounts[d.id] || 0;

                return (
                  <button
                    key={d.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    onClick={() => handleToggleDifficulty(d.id)}
                    className={`group relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all duration-150 cursor-pointer ${
                      isSelected
                        ? 'border-[#69ff00]/75 bg-[#18181B]'
                        : 'border-[#29292E] bg-[#0A0A0B] hover:border-[#3F3F46] hover:bg-[#141417]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 w-full">
                      <div className="flex items-center gap-2.5">
                        {/* Refined Custom Checkbox */}
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all duration-150 ${
                            isSelected
                              ? 'border-[#69ff00] bg-[#69ff00] text-[#0A0A0B]'
                              : 'border-[#3F3F46] bg-[#111113] group-hover:border-[#52525B]'
                          }`}
                        >
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 stroke-[2.75]" />
                          )}
                        </span>

                        <span
                          className={`text-sm font-medium transition-colors ${
                            isSelected
                              ? 'text-[#F5F5F5]'
                              : 'text-[#A1A1AA] group-hover:text-[#F5F5F5]'
                          }`}
                        >
                          {d.label}
                        </span>
                      </div>

                      <span className="inline-flex items-center gap-1.5 rounded-full border border-[#29292E] bg-[#111113] px-2.5 py-0.5 text-xs tabular-nums text-[#A1A1AA]">
                        <span
                          className={`h-1.5 w-1.5 rounded-full ${d.dotColor}`}
                        />
                        <span>
                          {selectedSkills.length > 0 ? countForDiff : '—'}
                        </span>
                      </span>
                    </div>

                    <p className="mt-2.5 text-xs leading-snug text-[#71717A]">
                      {d.description}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Session Length Selector */}
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-[#1F1F23] pt-4">
              <div>
                <div className="text-xs font-medium text-[#F5F5F5]">
                  Session Length
                </div>
                <div className="text-xs text-[#71717A]">
                  Choose a fixed number of questions or practice all matching items
                </div>
              </div>

              <div
                role="group"
                aria-label="Session question count"
                className="inline-flex items-center gap-1 self-start sm:self-auto rounded-full border border-[#29292E] bg-[#0A0A0B] p-1"
              >
                {SESSION_LENGTH_OPTIONS.map((opt) => {
                  const isActive = questionCountLimit === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => {
                        soundEngine.play('select');
                        setQuestionCountLimit(opt.value);
                        updateSettings({ defaultQuestionCount: opt.value });
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-[#69ff00] text-[#0A0A0B] font-semibold'
                          : 'text-[#A1A1AA] hover:text-[#F5F5F5]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Inline Warning when skills + difficulties selected but 0 matching questions */}
          {hasValidSelection && maxAvailableQuestions === 0 && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-[#4C2024] bg-[#201214] p-4 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                No questions match this exact combination of skills and
                difficulty. Try selecting additional difficulty levels or
                skills.
              </div>
            </div>
          )}

          {startError && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-[#4C2024] bg-[#201214] p-4 text-xs text-red-200">
              <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <span>{startError}</span>
            </div>
          )}

          {/* Direct Start Practice! Action */}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-4 border-t border-[#1F1F23] pt-6">
            <Button3D
              variant="ghost"
              size="md"
              onClick={() => {
                soundEngine.play('click');
                navigateToStep(1);
              }}
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back</span>
            </Button3D>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <span className="text-xs text-[#71717A]">
                {!hasValidSelection ? (
                  'Select at least 1 skill and 1 difficulty to begin'
                ) : questionCountLimit > 0 &&
                  questionCountLimit < maxAvailableQuestions ? (
                  <span>
                    <strong className="font-semibold tabular-nums text-[#F5F5F5]">
                      {effectiveSessionCount.toLocaleString()}
                    </strong>{' '}
                    of {maxAvailableQuestions.toLocaleString()} matching
                    questions ready
                  </span>
                ) : (
                  <span>
                    <strong className="font-semibold tabular-nums text-[#F5F5F5]">
                      {maxAvailableQuestions.toLocaleString()}
                    </strong>{' '}
                    matching questions ready
                  </span>
                )}
              </span>

              <Button3D
                variant="primary"
                size="lg"
                disabled={!canStartSession}
                onClick={handleStartPractice}
                className="px-7"
              >
                {isStarting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <span>Start Practice</span>
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button3D>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
