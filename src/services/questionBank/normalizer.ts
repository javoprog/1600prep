import {
  AnswerOption,
  DifficultyCode,
  DomainTaxonomyItem,
  Question,
  QuestionMeta,
  SkillTaxonomyItem,
  SubjectCode,
  TaxonomyData,
} from '@/types';

export interface RawLookupSkill {
  text: string;
  id: string;
}

export interface RawLookupDomain {
  text: string;
  id: string;
  primaryClassCd: string;
  skill: RawLookupSkill[];
}

export interface RawLookupResponse {
  lookupData?: {
    assessment?: Array<{ text: string; id: string }>;
    test?: Array<{ text: string; id: string }>;
    domain?: {
      'R&W'?: RawLookupDomain[];
      Math?: RawLookupDomain[];
    };
  };
  mathLiveItems?: string[];
  readingLiveItems?: string[];
}

export interface RawQuestionListItem {
  updateDate?: number;
  createDate?: number;
  pPcc?: string;
  questionId?: string;
  skill_cd?: string;
  score_band_range_cd?: number;
  skill_desc?: string;
  program?: string;
  primary_class_cd_desc?: string;
  ibn?: string | null;
  external_id?: string | null;
  primary_class_cd?: string;
  uId?: string;
  difficulty?: string;
}

export interface RawDigitalQuestion {
  type?: string; // 'mcq' | 'spr'
  stem?: string;
  stimulus?: string;
  keys?: string[];
  correct_answer?: string[];
  answerOptions?: Array<{
    id: string;
    content: string;
  }>;
  rationale?: string;
  externalid?: string;
}

export interface RawDisclosedQuestion {
  item_id?: string;
  section?: string;
  body?: string;
  prompt?: string;
  answer?: {
    style?: string; // 'Multiple Choice' | 'SPR'
    choices?: Record<string, { body?: string }>;
    correct_choice?: string;
    rationale?: string;
  };
}

const OPTION_LABELS: Array<'A' | 'B' | 'C' | 'D'> = ['A', 'B', 'C', 'D'];

export function normalizeSkillLabel(desc: string): string {
  const trimmed = (desc || '').trim().replace(/\s+/g, ' ');
  if (trimmed.toLowerCase() === 'cross-text connections') {
    return 'Cross-Text Connections';
  }
  return trimmed;
}

export function normalizeDifficulty(raw?: string | null): DifficultyCode | null {
  if (!raw) return null;
  const upper = raw.trim().toUpperCase();
  if (upper === 'E' || upper === 'M' || upper === 'H') {
    return upper as DifficultyCode;
  }
  return null;
}

export function normalizeQuestionMetaList(
  rawList: RawQuestionListItem[],
  subject: SubjectCode
): QuestionMeta[] {
  const seenIds = new Set<string>();
  const result: QuestionMeta[] = [];

  for (const item of rawList) {
    if (!item || typeof item !== 'object') continue;
    const externalId = item.external_id ? String(item.external_id).trim() : null;
    const ibn = item.ibn ? String(item.ibn).trim() : null;
    if (!externalId && !ibn) continue;

    const qId = (item.questionId || item.uId || externalId || ibn || '').trim();
    if (!qId || seenIds.has(qId)) continue;
    seenIds.add(qId);

    const domain = (item.primary_class_cd || '').trim();
    const domainLabel = (item.primary_class_cd_desc || domain).trim();
    const skill = (item.skill_cd || '').trim();
    const skillLabel = normalizeSkillLabel(item.skill_desc || skill);

    result.push({
      id: qId,
      uId: (item.uId || qId).trim(),
      questionId: qId,
      externalId,
      ibn,
      subject,
      subjectLabel: subject === 'rw' ? 'Reading & Writing' : 'Math',
      domain,
      domainLabel,
      skill,
      skillLabel,
      difficulty: normalizeDifficulty(item.difficulty),
      scoreBand: typeof item.score_band_range_cd === 'number' ? item.score_band_range_cd : undefined,
      createDate: item.createDate,
      updateDate: item.updateDate,
    });
  }

  return result;
}

export function buildTaxonomyFromLookupAndMetas(
  lookup: RawLookupResponse | null,
  rwMetas: QuestionMeta[],
  mathMetas: QuestionMeta[]
): TaxonomyData {
  const buildSubjectDomains = (
    subject: SubjectCode,
    rawDomains: RawLookupDomain[] | undefined,
    metas: QuestionMeta[]
  ): DomainTaxonomyItem[] => {
    // Map actual skill codes & counts from question metadata
    const domainMap = new Map<
      string,
      {
        id: string;
        primaryClassCd: string;
        text: string;
        skillsByLabel: Map<string, { id: string; code: string; text: string; count: number }>;
        count: number;
      }
    >();

    if (rawDomains && rawDomains.length > 0) {
      for (const d of rawDomains) {
        const skillsByLabel = new Map<string, { id: string; code: string; text: string; count: number }>();
        for (const s of d.skill || []) {
          const normText = normalizeSkillLabel(s.text);
          skillsByLabel.set(normText.toLowerCase(), {
            id: s.id,
            code: normText, // will be updated with actual skill_cd from metas
            text: normText,
            count: 0,
          });
        }
        domainMap.set(d.primaryClassCd, {
          id: d.id,
          primaryClassCd: d.primaryClassCd,
          text: d.text.trim(),
          skillsByLabel,
          count: 0,
        });
      }
    }

    for (const m of metas) {
      let dom = domainMap.get(m.domain);
      if (!dom) {
        dom = {
          id: m.domain,
          primaryClassCd: m.domain,
          text: m.domainLabel || m.domain,
          skillsByLabel: new Map(),
          count: 0,
        };
        domainMap.set(m.domain, dom);
      }
      dom.count += 1;

      const key = m.skillLabel.toLowerCase();
      const existingSkill = dom.skillsByLabel.get(key);
      if (existingSkill) {
        existingSkill.code = m.skill;
        existingSkill.count += 1;
      } else {
        dom.skillsByLabel.set(key, {
          id: m.skill,
          code: m.skill,
          text: m.skillLabel,
          count: 1,
        });
      }
    }

    const result: DomainTaxonomyItem[] = [];
    for (const dom of domainMap.values()) {
      const skills: SkillTaxonomyItem[] = Array.from(dom.skillsByLabel.values()).map((s) => ({
        id: s.id,
        code: s.code,
        text: s.text,
        questionCount: s.count,
      }));
      result.push({
        id: dom.id,
        primaryClassCd: dom.primaryClassCd,
        text: dom.text,
        subject,
        skills,
        questionCount: dom.count,
      });
    }
    return result;
  };

  return {
    rw: buildSubjectDomains('rw', lookup?.lookupData?.domain?.['R&W'], rwMetas),
    math: buildSubjectDomains('math', lookup?.lookupData?.domain?.Math, mathMetas),
    fetchedAt: Date.now(),
  };
}

function extractImagesFromHtml(...htmlParts: Array<string | undefined>): string[] {
  const images: string[] = [];
  for (const part of htmlParts) {
    if (!part) continue;
    if (part.includes('<svg')) {
      images.push('inline-svg');
    }
    const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let match: RegExpExecArray | null;
    while ((match = imgRegex.exec(part)) !== null) {
      if (match[1]) {
        images.push(match[1]);
      }
    }
  }
  return images;
}

export function normalizeDigitalQuestion(
  meta: QuestionMeta,
  raw: RawDigitalQuestion
): Question {
  const rawType = (raw.type || '').toLowerCase();
  const isSpr = rawType === 'spr' || (!raw.answerOptions?.length && rawType !== 'mcq');
  const questionType = isSpr ? 'spr' : 'mcq';

  let answerOptions: AnswerOption[] | undefined;
  let correctAnswer: string[] = [];

  if (questionType === 'mcq' && Array.isArray(raw.answerOptions)) {
    answerOptions = raw.answerOptions.slice(0, 4).map((opt, idx) => ({
      id: opt.id || OPTION_LABELS[idx],
      label: OPTION_LABELS[idx] || 'A',
      content: opt.content || '',
    }));

    // Determine correct letter(s) from correct_answer or keys matching option id
    if (Array.isArray(raw.correct_answer) && raw.correct_answer.length > 0) {
      correctAnswer = raw.correct_answer.map((a) => String(a).trim().toUpperCase());
    } else if (Array.isArray(raw.keys) && raw.keys.length > 0) {
      const matchedLabels = answerOptions
        .filter((opt) => raw.keys!.includes(opt.id) || raw.keys!.includes(opt.label))
        .map((opt) => opt.label);
      correctAnswer = matchedLabels.length > 0 ? matchedLabels : raw.keys.map((k) => String(k).trim());
    }
  } else {
    // Student-produced response (SPR)
    const rawAns =
      Array.isArray(raw.correct_answer) && raw.correct_answer.length > 0
        ? raw.correct_answer
        : Array.isArray(raw.keys)
        ? raw.keys
        : [];
    correctAnswer = Array.from(new Set(rawAns.map((a) => String(a).trim()).filter(Boolean)));
  }

  const passage = raw.stimulus && raw.stimulus.trim().length > 0 ? raw.stimulus : undefined;
  const questionContent = raw.stem || '';
  const explanation = raw.rationale && raw.rationale.trim().length > 0 ? raw.rationale : undefined;

  return {
    ...meta,
    questionType,
    questionContent,
    passage,
    answerOptions,
    correctAnswer,
    explanation,
    images: extractImagesFromHtml(passage, questionContent),
    cachedAt: Date.now(),
  };
}

const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const WORD_DENOMINATORS: Record<string, number> = {
  half: 2,
  halves: 2,
  third: 3,
  thirds: 3,
  fourth: 4,
  fourths: 4,
  quarter: 4,
  quarters: 4,
  fifth: 5,
  fifths: 5,
  sixth: 6,
  sixths: 6,
  seventh: 7,
  sevenths: 7,
  eighth: 8,
  eighths: 8,
  ninth: 9,
  ninths: 9,
  tenth: 10,
  tenths: 10,
};

function parseSpokenFraction(text: string): string[] {
  const cleaned = text.toLowerCase().trim();
  const isNegative = cleaned.startsWith('negative ') || cleaned.startsWith('minus ');
  const body = cleaned.replace(/^(negative|minus)\s+/, '');

  // e.g. "7 over 6" or "three over four"
  const overMatch = body.match(/^(\d+|[a-z]+)\s+over\s+(\d+|[a-z]+)$/);
  if (overMatch) {
    const num = /^\d+$/.test(overMatch[1]) ? Number(overMatch[1]) : WORD_NUMBERS[overMatch[1]];
    const den = /^\d+$/.test(overMatch[2]) ? Number(overMatch[2]) : WORD_NUMBERS[overMatch[2]];
    if (num !== undefined && den) {
      const sign = isNegative ? '-' : '';
      return [`${sign}${num}/${den}`];
    }
  }

  // e.g. "three halves", "one half", "four fifths"
  const parts = body.split(/[\s-]+/);
  if (parts.length === 2) {
    const num = /^\d+$/.test(parts[0]) ? Number(parts[0]) : WORD_NUMBERS[parts[0]];
    const den = WORD_DENOMINATORS[parts[1]];
    if (num !== undefined && den) {
      const sign = isNegative ? '-' : '';
      const frac = `${sign}${num}/${den}`;
      const dec = Number(((isNegative ? -1 : 1) * (num / den)).toFixed(4));
      return [frac, String(dec)];
    }
  }

  return [];
}

function stripThousandsCommas(text: string): string {
  // Remove thousands separators inside numbers like "1,250" or "12,500" while keeping lists like "7, 8, or 13" intact
  return text.replace(/(\d),(?=\d{3}(?!\d))/g, '$1');
}

export function extractDisclosedSprAnswers(rationaleHtml?: string): string[] {
  if (!rationaleHtml) return [];
  const results = new Set<string>();

  // Replace <img ... alt="..."> with [alt]
  const textWithAlts = rationaleHtml
    .replace(/<img[^>]*alt=["']([^"']*)["'][^>]*>/gi, ' [$1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 1. Check "Note that X and Y are examples of ways to enter a correct answer"
  const noteMatch = textWithAlts.match(
    /Note that\s+(.+?)\s+(?:are|is)\s+examples?\s+of\s+ways?\s+to\s+enter/i
  );
  if (noteMatch && noteMatch[1]) {
    const tokens = stripThousandsCommas(noteMatch[1]).match(/-?\d+(?:\/\d+|\.\d+)?/g);
    if (tokens) {
      tokens.forEach((t) => results.add(t));
    }
  }

  // 2. Check "The correct answer is ..." (preserve decimal points inside numbers like 1.5 or 2.5)
  const firstSentMatch = textWithAlts.match(
    /The correct answer is\s+((?:\.\d|[^.])+)/i
  );
  if (firstSentMatch && firstSentMatch[1]) {
    const rawAns = firstSentMatch[1].trim();

    // Check bracketed alt text like [three halves] or [7 over 6]
    const bracketMatches = rawAns.match(/\[([^\]]+)\]/g);
    if (bracketMatches) {
      for (const bm of bracketMatches) {
        const inner = bm.slice(1, -1);
        const parsedFracs = parseSpokenFraction(inner);
        parsedFracs.forEach((f) => results.add(f));
        const numTokens = stripThousandsCommas(inner).match(/-?\d+(?:\/\d+|\.\d+)?/g);
        if (numTokens && parsedFracs.length === 0) {
          numTokens.forEach((t) => results.add(t));
        }
      }
    }

    // Check plain numbers in "The correct answer is 2.6", "1,250", or "either 7, 8, or 13"
    const withoutBrackets = stripThousandsCommas(rawAns.replace(/\[[^\]]+\]/g, ''));
    const nums = withoutBrackets.match(/-?\d+(?:\/\d+|\.\d+)?/g);
    if (nums) {
      nums.forEach((n) => results.add(n));
    }
  }

  return Array.from(results);
}

export function normalizeDisclosedQuestion(
  meta: QuestionMeta,
  rawList: RawDisclosedQuestion[]
): Question {
  const raw = Array.isArray(rawList) && rawList.length > 0 ? rawList[0] : {};
  const style = (raw.answer?.style || '').toLowerCase();
  const isSpr = style === 'spr';
  const questionType = isSpr ? 'spr' : 'mcq';

  let answerOptions: AnswerOption[] | undefined;
  let correctAnswer: string[] = [];

  if (questionType === 'mcq' && raw.answer?.choices) {
    const choices = raw.answer.choices;
    const keys = ['a', 'b', 'c', 'd'] as const;
    answerOptions = keys
      .filter((k) => choices[k])
      .map((k, idx) => ({
        id: k.toUpperCase(),
        label: OPTION_LABELS[idx],
        content: choices[k]?.body || '',
      }));

    if (raw.answer.correct_choice) {
      correctAnswer = [raw.answer.correct_choice.trim().toUpperCase()];
    }
  } else {
    correctAnswer = extractDisclosedSprAnswers(raw.answer?.rationale);
  }

  const passage = raw.body && raw.body.trim().length > 0 ? raw.body : undefined;
  const questionContent = raw.prompt || '';
  const explanation =
    raw.answer?.rationale && raw.answer.rationale.trim().length > 0
      ? raw.answer.rationale
      : undefined;

  return {
    ...meta,
    questionType,
    questionContent,
    passage,
    answerOptions,
    correctAnswer,
    explanation,
    images: extractImagesFromHtml(passage, questionContent),
    cachedAt: Date.now(),
  };
}

// --- SPR Numerical Equivalence Evaluator ---

export function isValidCompleteSprFormat(input: string): boolean {
  const cleaned = input.trim().replace(/\s+/g, '');
  if (!cleaned) return false;
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+|\d+\/\d+)$/.test(cleaned)) {
    return false;
  }
  return parseNumericValue(cleaned) !== null;
}

export function parseNumericValue(input: string): number | null {
  const cleaned = stripThousandsCommas(input.trim().replace(/\s+/g, ''));
  if (!cleaned) return null;

  // Fraction: e.g. 3/2, -3/4
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/');
    if (parts.length !== 2) return null;
    const num = Number(parts[0]);
    const den = Number(parts[1]);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return null;
    return num / den;
  }

  const val = Number(cleaned);
  return Number.isFinite(val) ? val : null;
}

export function evaluateAnswer(
  question: Question,
  userAnswer: string
): boolean {
  const cleanedUser = userAnswer.trim();
  if (!cleanedUser) return false;

  if (question.questionType === 'mcq') {
    const upperUser = cleanedUser.toUpperCase();
    return question.correctAnswer.some((ans) => ans.trim().toUpperCase() === upperUser);
  }

  // Student-Produced Response (SPR)
  const normUserStr = cleanedUser.replace(/^0+(\.\d+)$/, '$1').toLowerCase();
  for (const key of question.correctAnswer) {
    const normKeyStr = key.trim().replace(/^0+(\.\d+)$/, '$1').toLowerCase();
    if (normUserStr === normKeyStr) {
      return true;
    }
  }

  const userVal = parseNumericValue(cleanedUser);
  if (userVal === null) return false;

  for (const key of question.correctAnswer) {
    const keyVal = parseNumericValue(key);
    if (keyVal === null) continue;

    // Exact mathematical equivalence (e.g., 3/2 === 1.5, 65/4 === 16.25)
    if (Math.abs(userVal - keyVal) < 1e-9) {
      return true;
    }

    // SAT 4-character rounding/truncation tolerance for repeating decimals (e.g., 3/17 -> 0.176 or .1764 or .1765)
    const decimalPart = cleanedUser.split('.')[1];
    if (decimalPart && decimalPart.length >= 3 && Math.abs(userVal - keyVal) <= 0.0006) {
      return true;
    }
  }

  return false;
}
