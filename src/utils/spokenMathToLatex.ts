/**
 * Converts College Board disclosed (IBN) math image `alt` descriptions
 * (MathSpeak / ARIA spoken math strings) into canonical LaTeX for KaTeX rendering.
 *
 * Returns `null` for non-mathematical descriptions (e.g. full prose data tables
 * or word-problem summary paragraphs) so callers can safely keep the fallback PNG.
 */

const WORD_UNITS: Record<string, number> = {
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
};

const WORD_TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const ORDINAL_WORDS: Record<string, string> = {
  first: '1',
  second: '2',
  third: '3',
  fourth: '4',
  fifth: '5',
  sixth: '6',
  seventh: '7',
  eighth: '8',
  ninth: '9',
  tenth: '10',
  eleventh: '11',
  twelfth: '12',
  thirteenth: '13',
  fourteenth: '14',
  fifteenth: '15',
  sixteenth: '16',
  seventeenth: '17',
  eighteenth: '18',
  nineteenth: '19',
  twentieth: '20',
};

const WORD_ORD_DENOM: Record<string, string> = {
  half: '2',
  halves: '2',
  third: '3',
  thirds: '3',
  fourth: '4',
  fourths: '4',
  quarter: '4',
  quarters: '4',
  fifth: '5',
  fifths: '5',
  sixth: '6',
  sixths: '6',
  seventh: '7',
  sevenths: '7',
  eighth: '8',
  eighths: '8',
  ninth: '9',
  ninths: '9',
  tenth: '10',
  tenths: '10',
  eleventh: '11',
  elevenths: '11',
  twelfth: '12',
  twelfths: '12',
};

const GREEK_WORDS: Record<string, string> = {
  pi: '\\pi ',
  theta: '\\theta ',
  alpha: '\\alpha ',
  beta: '\\beta ',
  gamma: '\\gamma ',
  delta: '\\Delta ',
  lambda: '\\lambda ',
  mu: '\\mu ',
  sigma: '\\sigma ',
  phi: '\\phi ',
  omega: '\\omega ',
  infinity: '\\infty ',
};

type Token =
  | { type: 'ATOM'; val: string }
  | { type: 'UNIT'; val: string }
  | { type: 'NTHROOT_START'; deg: string }
  | { type: string; val?: string };

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

function replaceWordNumbers(str: string): string {
  // Compound tens + units: "thirty-eight", "thirty eight"
  let out = str.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)[-\s]+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_, t: string, u: string) =>
      String(WORD_TENS[t.toLowerCase()] + WORD_UNITS[u.toLowerCase()])
  );
  // Standalone tens
  out = out.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\b/gi,
    (_, t: string) => String(WORD_TENS[t.toLowerCase()])
  );
  // Standalone zero..nineteen
  out = out.replace(
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi,
    (_, u: string) => String(WORD_UNITS[u.toLowerCase()])
  );
  // Mixed numbers like "11 and 2-thirds" / "17 and 1-half"
  out = out.replace(
    /\b(\d+)\s+and\s+(\d+)[-\s]+(half|halves|thirds?|fourths?|quarters?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|elevenths?|twelfths?)\b/gi,
    (_, w: string, n: string, d: string) =>
      `${w} MIXED_SEP ${n} over ${WORD_ORD_DENOM[d.toLowerCase()]}`
  );
  // Word fractions: "13 thirds", "1 twelfth", "3 fourths"
  out = out.replace(
    /\b(\d+)[-\s]+(half|halves|thirds?|fourths?|quarters?|fifths?|sixths?|sevenths?|eighths?|ninths?|tenths?|elevenths?|twelfths?)\b/gi,
    (_, n: string, d: string) => `${n} over ${WORD_ORD_DENOM[d.toLowerCase()]}`
  );
  return out;
}

function preprocessAlt(raw: string): string {
  let s = decodeHtmlEntities(raw).replace(/\s+/g, ' ').trim();
  // Normalize comma thousands before comma tokenization ("50,000" -> "50000")
  s = s.replace(/(\d),(\d{3})\b/g, '$1$2');
  s = s.replace(/\s*[.;]\s*$/, '').trim();

  if (/^degrees?\s+Fahrenheit$/i.test(s)) return '__RAW_TEX__^\\circ\\text{F}';
  if (/^degrees?\s+Celsius$/i.test(s)) return '__RAW_TEX__^\\circ\\text{C}';
  if (/^plus$/i.test(s)) return '__RAW_TEX__+';
  if (/^minus$/i.test(s)) return '__RAW_TEX__-';

  s = replaceWordNumbers(s);

  // Spoken decimals: "0 point 4", "3 point 5", "0 point 2 4", "12 point 16"
  s = s.replace(
    /\b(\d+)\s+point\s+(\d+(?:\s+\d+)*)\b/gi,
    (_, intPart: string, decPart: string) =>
      `${intPart}.${decPart.replace(/\s+/g, '')}`
  );
  s = s.replace(
    /\bpoint\s+(\d+(?:\s+\d+)*)\b/gi,
    (_, decPart: string) => `.${decPart.replace(/\s+/g, '')}`
  );

  // Geometry symbols
  s = s.replace(
    /\b(?:the\s+)?length\s+of\s+(?:(?:the\s+)?(?:side|line\s+segment|segment)\s+)?([A-Z])(?:\s*,?\s*([A-Z]))?(?:\s*,?\s*([A-Z]))?\b/g,
    (_, a: string, b?: string, c?: string) => `GEOM_${a}${b || ''}${c || ''} `
  );
  s = s.replace(
    /\b(?:the\s+)?(?:line\s+segment|segment)\s+([A-Z])(?:\s*,?\s*([A-Z]))?\b/g,
    (_, a: string, b?: string) => `SEG_${a}${b || ''} `
  );
  s = s.replace(
    /\b(?:side|line)\s+([A-Z])(?:\s*,?\s*([A-Z]))?\b/g,
    (_, a: string, b?: string) => `GEOM_${a}${b || ''} `
  );
  s = s.replace(
    /\btriangle\s+([A-Z])(?:\s*,?\s*([A-Z]))?(?:\s*,?\s*([A-Z]))?\b/g,
    (_, a: string, b?: string, c?: string) => `TRI_${a}${b || ''}${c || ''} `
  );
  s = s.replace(
    /\b(?:the\s+measure\s+of\s+)?angle\s+([A-Z])(?:\s*,?\s*([A-Z]))?(?:\s*,?\s*([A-Z]))?\b/g,
    (_, a: string, b?: string, c?: string) => `ANG_${a}${b || ''}${c || ''} `
  );

  s = s.replace(/\bdegrees?\s+Fahrenheit\b/gi, 'DEGREE_FAHRENHEIT');
  s = s.replace(/\bdegrees?\s+Celsius\b/gi, 'DEGREE_CELSIUS');
  s = s.replace(/\bdot\s+dot\s+dot\b/gi, ' ELLIPSIS ');
  return s;
}

const ORDINAL_RE = new RegExp(`\\b(${Object.keys(ORDINAL_WORDS).join('|')})\\b`, 'gi');

const PHRASE_REPLACEMENTS: Array<[RegExp, string | ((...args: string[]) => string)]> = [
  // Power phrases MUST run before generic "the fraction" so "raised to the fraction a over b power" stays intact
  [/\braised\s+to\s+the\s+power(?:\s+of)?\b/gi, ' POW_START '],
  [/\braised\s+to\s+the\b/gi, ' POW_START '],
  [/\bto\s+the\s+power(?:\s+of)?\b/gi, ' POW_START '],
  [/\bto\s+the\b/gi, ' POW_START '],
  [/\bend\s+(?:exponent|superscript|power)\b/gi, ' POW_END '],
  [/\bpower\b/gi, ' POW_END '],

  [/\b(?:the\s+)?fraction\s+with\s+numerator\b/gi, ' FRAC_NUM '],
  [/\b(?:the\s+)?numerator\b/gi, ' FRAC_NUM '],
  [/,?\s+and\s+denominator\b/gi, ' FRAC_DEN '],
  [/\bend\s+fraction\b/gi, ' FRAC_END '],
  [/\b(?:the\s+)?negative\s+of\s+(?:the\s+)?fraction\b/gi, ' NEG_KW FRAC_START '],
  [/\bthe\s+negative\s+fraction\b/gi, ' NEG_KW FRAC_START '],
  [/\bnegative\s+fraction\b/gi, ' NEG_KW FRAC_START '],
  [/\b(?:the\s+)?negative\s+square\s+root\s+of\b/gi, ' NEG_KW SQRT_START '],
  [/\b(?:the\s+)?negative\s+of\b/gi, ' NEG_KW '],
  [/\b(?:the\s+)?fraction\b/gi, ' FRAC_START '],
  [/\b(?:the\s+)?square\s+root\s+of\b/gi, ' SQRT_START '],
  [/\b(?:the\s+)?cube\s+root\s+of\b/gi, ' CBRT_START '],
  [/\b(?:the\s+)?([A-Za-z0-9]+)\s+root\s+of\b/gi, ' NTHROOT_$1 '],
  [/\bend\s+root\b/gi, ' ROOT_END '],
  [/\b(?:the\s+)?absolute\s+value\s+of\b/gi, ' ABS_START '],
  [/\bstart\s+absolute\s+value\b/gi, ' ABS_START '],
  [/\bend\s+absolute\s+value\b/gi, ' ABS_END '],
  [/\b(?:close|right|end)\s+(?:(?:inner|outer)\s+)?parenthesis\b/gi, ' CLOSE_PAREN '],
  [/\b(?:(?:open|left)\s+)?(?:(?:inner|outer)\s+)?parenthesis\b/gi, ' OPEN_PAREN '],
  [/\b(?:open|left)\s+bracket\b/gi, ' OPEN_BRACK '],
  [/\b(?:close|right)\s+bracket\b/gi, ' CLOSE_BRACK '],
  [/\b(?:open|left)\s+brace\b/gi, ' OPEN_BRACE '],
  [/\b(?:close|right)\s+brace\b/gi, ' CLOSE_BRACE '],
  [/\bsquared\b/gi, ' SQUARED '],
  [/\bcubed\b/gi, ' CUBED '],
  [/\bend\s+subscript\b/gi, ' SUB_END '],
  [/\bsubscript\b/gi, ' SUB_START '],
  [/\bsub\b/gi, ' SUB_OP '],

  [/\b(?:which\s+|and\s+)?(?:is\s+)?greater\s+than\s+or\s+equal\s+to\b/gi, ' GE '],
  [/\b(?:which\s+|and\s+)?(?:is\s+)?less\s+than\s+or\s+equal\s+to\b/gi, ' LE '],
  [/\b(?:which\s+|and\s+)?(?:is\s+)?not\s+equal\s+to\b/gi, ' NE '],
  [/\b(?:which\s+|and\s+)?(?:is\s+)?approximately\s+(?:equal\s+to|equals)\b/gi, ' APPROX '],
  [/\b(?:which\s+|and\s+)?(?:is\s+)?greater\s+than\b/gi, ' GT '],
  [/\b(?:which\s+|and\s+)?(?:is\s+)?less\s+than\b/gi, ' LT '],
  [/\bwhich\s+equals\b/gi, ' EQ '],
  [/\b(?:is\s+)?equal\s+to\b/gi, ' EQ '],
  [/\bequals\b/gi, ' EQ '],
  [/\bplus[- ]or[- ]minus\b/gi, ' PM '],
  [/\bminus\b/gi, ' MINUS '],
  [/\bplus\b/gi, ' PLUS '],
  [/\btimes\b/gi, ' TIMES '],
  [/\bmultiplied\s+by\b/gi, ' TIMES '],
  [/\bdivided\s+by\b/gi, ' DIV '],
  [/\bover\b/gi, ' OVER '],
  [/\bnegative\b/gi, ' NEG_KW '],
  [/\bpositive\b/gi, ' POS_KW '],
  [/\bdegrees?\b/gi, ' DEG '],
  [/\bpercent\b/gi, ' PCT '],
  [/\bcomma\b/gi, ' COMMA '],
  [/\bprime\b/gi, ' PRIME '],
  [/\b(?:the\s+)?sine\s+(?:of\s+)?/gi, ' FN_SIN '],
  [/\b(?:the\s+)?cosine\s+(?:of\s+)?/gi, ' FN_COS '],
  [/\b(?:the\s+)?tangent\s+(?:of\s+)?/gi, ' FN_TAN '],
  [/\b(?:the\s+)?sin\s+(?:of\s+)?/gi, ' FN_SIN '],
  [/\b(?:the\s+)?cos\s+(?:of\s+)?/gi, ' FN_COS '],
  [/\b(?:the\s+)?tan\s+(?:of\s+)?/gi, ' FN_TAN '],
  [/\bnatural\s+log\s+(?:of\s+)?/gi, ' FN_LN '],
  [
    /\b(cubic\s+centimeters?|square\s+centimeters?|centimeters?|kilometers?|meters?|millimeters?|miles?|hours?|minutes?|seconds?|days?|grams?|ounces?|cubic\s+inch(?:es)?|radians?|dollars?|millions?|fluid\s+ounces?|gallons?|per\s+hour|per\s+cubic\s+centimeter|per\s+second)\b/gi,
    (_, u: string) => ` UNIT_${u.replace(/\s+/g, '_')} `,
  ],
];

function tokenizeSingleExpr(raw: string): {
  tokens: Token[];
  wrapOrderedPair: boolean;
  wrapSetBraces: boolean;
} {
  let s = raw.trim();

  let wrapOrderedPair = false;
  let wrapSetBraces = false;
  const setMatch = s.match(/^(?:the\s+)?set\s+consisting\s+of\s+/i);
  if (setMatch) {
    wrapSetBraces = true;
    s = s
      .slice(setMatch[0].length)
      .replace(/,\s+and\s+/gi, ' COMMA ')
      .replace(/\s+and\s+/gi, ' COMMA ');
  } else {
    const opMatch = s.match(
      /^(?:(?:the\s+)?ordered\s+pair,?\s+|(?:the\s+)?points?\s+with\s+coordinates\s+|with\s+coordinates\s+)/i
    );
    if (opMatch) {
      wrapOrderedPair = true;
      s = s.slice(opMatch[0].length).replace(/,\s*$/, '');
    }
  }

  s = s.replace(ORDINAL_RE, (_, w: string) => ORDINAL_WORDS[w.toLowerCase()]);

  for (const [re, rep] of PHRASE_REPLACEMENTS) {
    s = typeof rep === 'string' ? s.replace(re, rep) : s.replace(re, rep);
  }

  s = s.replace(/\b([A-Za-z])\s+of\b(?=[,\s])/g, '$1 FN_OF ');
  s = s.replace(/\b(\d+)(?:st|nd|rd|th)\b/gi, '$1');
  s = s.replace(/\b([a-z])th\b/gi, '$1');
  s = s.replace(/\b(\d+(?:\.\d+)?)([a-z])\b/g, '$1 $2');

  const rawTokens = s
    .replace(/,/g, ' RAWCOMMA ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const tokens: Token[] = [];
  for (const t of rawTokens) {
    if (t === 'RAWCOMMA') {
      tokens.push({ type: 'PAUSE' });
      continue;
    }
    if (t === 'DEGREE_FAHRENHEIT') {
      tokens.push({ type: 'DEG_F' });
      continue;
    }
    if (t === 'DEGREE_CELSIUS') {
      tokens.push({ type: 'DEG_C' });
      continue;
    }
    if (t === 'ELLIPSIS') {
      tokens.push({ type: 'ATOM', val: '\\ldots ' });
      continue;
    }
    if (t.startsWith('GEOM_')) {
      tokens.push({ type: 'ATOM', val: t.slice(5) });
      continue;
    }
    if (t.startsWith('SEG_')) {
      tokens.push({ type: 'ATOM', val: `\\overline{${t.slice(4)}}` });
      continue;
    }
    if (t.startsWith('TRI_')) {
      tokens.push({ type: 'ATOM', val: `\\triangle ${t.slice(4)}` });
      continue;
    }
    if (t.startsWith('ANG_')) {
      tokens.push({ type: 'ATOM', val: `\\angle ${t.slice(4)}` });
      continue;
    }
    if (t.startsWith('NTHROOT_')) {
      tokens.push({ type: 'NTHROOT_START', deg: t.slice(8) });
      continue;
    }
    if (t.startsWith('UNIT_')) {
      tokens.push({ type: 'UNIT', val: t.slice(5).replace(/_/g, ' ') });
      continue;
    }
    if (/^[A-Z0-9_]+$/.test(t) && t.length > 1 && t !== 'I' && !/^\d+$/.test(t)) {
      tokens.push({ type: t });
      continue;
    }
    if (t === '$') {
      tokens.push({ type: 'DOLLAR' });
      continue;
    }
    if (t === '%') {
      tokens.push({ type: 'PCT' });
      continue;
    }
    const low = t.toLowerCase();
    if (GREEK_WORDS[low]) {
      tokens.push({ type: 'ATOM', val: GREEK_WORDS[low] });
      continue;
    }
    if (/^\d*(?:\.\d+)?$/.test(t) && t !== '' && t !== '.') {
      tokens.push({ type: 'ATOM', val: t });
      continue;
    }
    if (/^[A-Za-z]$/.test(t)) {
      tokens.push({ type: 'ATOM', val: t });
      continue;
    }
    if (t === '+') {
      tokens.push({ type: 'PLUS' });
      continue;
    }
    if (t === '-' || t === '−' || t === '–') {
      tokens.push({ type: 'MINUS' });
      continue;
    }
    if (t === '=') {
      tokens.push({ type: 'EQ' });
      continue;
    }
    if (t === '<') {
      tokens.push({ type: 'LT' });
      continue;
    }
    if (t === '>') {
      tokens.push({ type: 'GT' });
      continue;
    }
    if (t === '≤') {
      tokens.push({ type: 'LE' });
      continue;
    }
    if (t === '≥') {
      tokens.push({ type: 'GE' });
      continue;
    }
    if (t === '×') {
      tokens.push({ type: 'TIMES' });
      continue;
    }
    if (t === '(') {
      tokens.push({ type: 'OPEN_PAREN' });
      continue;
    }
    if (t === ')') {
      tokens.push({ type: 'CLOSE_PAREN' });
      continue;
    }
    if (t === ':') {
      tokens.push({ type: 'COLON' });
      continue;
    }

    tokens.push({ type: 'UNKNOWN', val: t });
  }

  return { tokens, wrapOrderedPair, wrapSetBraces };
}

const REL_TYPES = new Set(['EQ', 'LT', 'GT', 'LE', 'GE', 'NE', 'APPROX', 'COLON']);
const REL_TEX: Record<string, string> = {
  EQ: ' = ',
  LT: ' < ',
  GT: ' > ',
  LE: ' \\le ',
  GE: ' \\ge ',
  NE: ' \\ne ',
  APPROX: ' \\approx ',
  COLON: ' : ',
};

function parseTokensToLatex(
  tokens: Token[],
  wrapOrderedPair: boolean,
  wrapSetBraces: boolean
): string | null {
  if (tokens.some((t) => t.type === 'UNKNOWN') || tokens.length === 0) {
    return null;
  }

  let pos = 0;
  const peek = (): Token | null => tokens[pos] || null;
  const skipPauses = () => {
    while (peek()?.type === 'PAUSE') pos++;
  };
  const hasFutureToken = (type: string): boolean => {
    for (let j = pos; j < tokens.length; j++) {
      if (tokens[j].type === type) return true;
    }
    return false;
  };

  function parseStatementList(stopSet: Set<string>): string | null {
    const first = parseRelation(stopSet);
    if (first == null) return null;
    const parts = [first];
    while (true) {
      skipPauses();
      const tk = peek();
      if (!tk || stopSet.has(tk.type)) break;
      if (tk.type === 'COMMA') {
        pos++;
        const next = parseRelation(stopSet);
        if (next == null) return null;
        parts.push(next);
      } else {
        break;
      }
    }
    const res = parts.join(', ');
    if (wrapOrderedPair) return `\\left(${res}\\right)`;
    if (wrapSetBraces) return `\\left\\{${res}\\right\\}`;
    return res;
  }

  function parseRelation(stopSet: Set<string>): string | null {
    skipPauses();
    const tk0 = peek();
    let left: string | null;
    if (tk0 && REL_TYPES.has(tk0.type)) {
      const op = REL_TEX[tk0.type].trimStart();
      pos++;
      const right = parseExpr(stopSet);
      if (right == null) return null;
      left = `${op}${right}`;
    } else {
      left = parseExpr(stopSet);
      if (left == null) return null;
    }

    while (true) {
      skipPauses();
      const tk = peek();
      if (!tk || stopSet.has(tk.type)) break;
      if (REL_TYPES.has(tk.type)) {
        const op = REL_TEX[tk.type];
        pos++;
        const right = parseExpr(stopSet);
        if (right == null) return null;
        left = `${left}${op}${right}`;
      } else {
        break;
      }
    }
    return left;
  }

  function parseExpr(stopSet: Set<string>): string | null {
    skipPauses();
    const firstTk = peek();
    if (
      firstTk &&
      (firstTk.type === 'PLUS' || firstTk.type === 'MINUS' || firstTk.type === 'PM')
    ) {
      let j = pos + 1;
      while (tokens[j]?.type === 'PAUSE') j++;
      const nextTk = tokens[j] || null;
      if (
        !nextTk ||
        stopSet.has(nextTk.type) ||
        nextTk.type === 'CLOSE_PAREN' ||
        nextTk.type === 'COMMA'
      ) {
        pos++;
        return firstTk.type === 'PLUS'
          ? '+'
          : firstTk.type === 'MINUS'
          ? '-'
          : '\\pm ';
      }
    }

    const first = parseTerm(stopSet);
    if (first == null) return null;
    const terms = [first];

    while (true) {
      skipPauses();
      const tk = peek();
      if (!tk || stopSet.has(tk.type) || REL_TYPES.has(tk.type) || tk.type === 'COMMA') {
        break;
      }
      if (tk.type === 'PLUS') {
        pos++;
        const rhs = parseTerm(stopSet);
        if (rhs == null) return null;
        terms.push(` + ${rhs}`);
      } else if (tk.type === 'MINUS') {
        pos++;
        const rhs = parseTerm(stopSet);
        if (rhs == null) return null;
        terms.push(` - ${rhs}`);
      } else if (tk.type === 'PM') {
        pos++;
        const rhs = parseTerm(stopSet);
        if (rhs == null) return null;
        terms.push(` \\pm ${rhs}`);
      } else if (tk.type === 'ATOM' && tk.val === '\\ldots ') {
        pos++;
        terms.push(' \\ldots ');
      } else {
        break;
      }
    }
    return terms.join('');
  }

  function parseTerm(stopSet: Set<string>): string | null {
    const factors: string[] = [];
    while (true) {
      skipPauses();
      const tk = peek();
      if (
        !tk ||
        stopSet.has(tk.type) ||
        REL_TYPES.has(tk.type) ||
        tk.type === 'PLUS' ||
        tk.type === 'MINUS' ||
        (tk.type === 'PM' && factors.length > 0) ||
        tk.type === 'COMMA'
      ) {
        break;
      }
      if (tk.type === 'TIMES') {
        pos++;
        const f = parseFactor(stopSet);
        if (f == null) return null;
        factors.push(` \\times ${f}`);
      } else if (tk.type === 'DIV') {
        pos++;
        const f = parseFactor(stopSet);
        if (f == null) return null;
        factors.push(` \\div ${f}`);
      } else if (tk.type === 'MIXED_SEP') {
        pos++;
      } else {
        const f = parseFactor(stopSet);
        if (f == null) return null;
        factors.push(f);
      }
    }
    return factors.length === 0 ? null : factors.join('');
  }

  function parseFactor(stopSet: Set<string>): string | null {
    skipPauses();
    const tk = peek();
    if (!tk) return null;

    let base: string | null = null;
    if (tk.type === 'NEG_KW') {
      pos++;
      const inner = parseFactor(stopSet);
      return inner == null ? null : `-${inner}`;
    }
    if (tk.type === 'POS_KW') {
      pos++;
      const inner = parseFactor(stopSet);
      return inner == null ? null : `+${inner}`;
    }
    if (tk.type === 'PM') {
      pos++;
      const inner = parseFactor(stopSet);
      return inner == null ? null : `\\pm ${inner}`;
    }
    if (tk.type === 'DOLLAR') {
      pos++;
      const inner = parseFactor(stopSet);
      return inner == null ? null : `\\$${inner}`;
    }
    if (tk.type === 'ATOM' && tk.val != null) {
      pos++;
      base = tk.val;
    } else if (tk.type === 'UNIT' && tk.val != null) {
      pos++;
      base = `\\text{ ${tk.val}}`;
    } else if (tk.type === 'OPEN_PAREN') {
      pos++;
      const inner = parseStatementList(new Set([...stopSet, 'CLOSE_PAREN']));
      skipPauses();
      if (peek()?.type === 'CLOSE_PAREN') pos++;
      if (inner == null) return null;
      base = `\\left(${inner}\\right)`;
    } else if (tk.type === 'OPEN_BRACK') {
      pos++;
      const inner = parseStatementList(new Set([...stopSet, 'CLOSE_BRACK']));
      skipPauses();
      if (peek()?.type === 'CLOSE_BRACK') pos++;
      if (inner == null) return null;
      base = `\\left[${inner}\\right]`;
    } else if (tk.type === 'ABS_START') {
      pos++;
      const inner = parseExpr(new Set([...stopSet, 'ABS_END']));
      skipPauses();
      if (peek()?.type === 'ABS_END') pos++;
      if (inner == null) return null;
      base = `\\left|${inner}\\right|`;
    } else if (
      tk.type === 'SQRT_START' ||
      tk.type === 'CBRT_START' ||
      tk.type === 'NTHROOT_START'
    ) {
      const deg =
        tk.type === 'CBRT_START'
          ? '3'
          : tk.type === 'NTHROOT_START'
          ? (tk as { deg: string }).deg
          : null;
      pos++;
      const inner = hasFutureToken('ROOT_END')
        ? parseExpr(new Set([...stopSet, 'ROOT_END']))
        : parseSinglePrimary(stopSet);
      skipPauses();
      if (peek()?.type === 'ROOT_END') pos++;
      if (inner == null) return null;
      base = deg ? `\\sqrt[${deg}]{${inner}}` : `\\sqrt{${inner}}`;
    } else if (tk.type === 'FRAC_NUM') {
      pos++;
      const num = parseExpr(new Set([...stopSet, 'FRAC_DEN', 'FRAC_END']));
      skipPauses();
      if (peek()?.type !== 'FRAC_DEN') return null;
      pos++;
      skipPauses();
      const hasEnd = hasFutureToken('FRAC_END');
      const den = hasEnd
        ? parseExpr(new Set([...stopSet, 'FRAC_END']))
        : parseTerm(
            new Set([...stopSet, 'CLOSE_PAREN', 'CLOSE_BRACK', 'COMMA', 'POW_END'])
          );
      skipPauses();
      if (peek()?.type === 'FRAC_END') pos++;
      if (num == null || den == null) return null;
      base = `\\frac{${num}}{${den}}`;
    } else if (tk.type === 'FRAC_START') {
      pos++;
      const num = parseExpr(new Set([...stopSet, 'OVER', 'FRAC_END']));
      skipPauses();
      if (peek()?.type !== 'OVER') return null;
      pos++;
      skipPauses();
      const hasEnd = hasFutureToken('FRAC_END');
      const den = hasEnd
        ? parseExpr(new Set([...stopSet, 'FRAC_END']))
        : parseSinglePrimary(new Set([...stopSet, 'POW_END']));
      skipPauses();
      if (peek()?.type === 'FRAC_END') pos++;
      if (num == null || den == null) return null;
      base = `\\frac{${num}}{${den}}`;
    } else if (
      tk.type === 'FN_SIN' ||
      tk.type === 'FN_COS' ||
      tk.type === 'FN_TAN' ||
      tk.type === 'FN_LN'
    ) {
      const fnMap: Record<string, string> = {
        FN_SIN: '\\sin',
        FN_COS: '\\cos',
        FN_TAN: '\\tan',
        FN_LN: '\\ln',
      };
      const fnName = fnMap[tk.type];
      pos++;
      skipPauses();
      const arg = parseFactor(stopSet);
      if (arg == null) return null;
      base = `${fnName} ${arg}`;
    } else {
      return null;
    }

    while (true) {
      skipPauses();
      const next = peek();
      if (!next || stopSet.has(next.type)) break;

      if (next.type === 'FN_OF') {
        pos++;
        skipPauses();
        let arg: string | null;
        if (peek()?.type === 'OPEN_PAREN') {
          pos++;
          arg = parseStatementList(new Set([...stopSet, 'CLOSE_PAREN']));
          skipPauses();
          if (peek()?.type === 'CLOSE_PAREN') pos++;
        } else {
          arg = parseFactor(stopSet);
        }
        if (arg == null) return null;
        base = `${base}\\left(${arg}\\right)`;
        continue;
      }
      if (next.type === 'SUB_OP') {
        pos++;
        const sub = parseSinglePrimary(stopSet);
        if (sub == null) return null;
        base = `${base}_{${sub}}`;
        continue;
      }
      if (next.type === 'SUB_START') {
        pos++;
        const hasEnd = hasFutureToken('SUB_END');
        const sub = hasEnd
          ? parseExpr(new Set([...stopSet, 'SUB_END']))
          : parseSinglePrimary(stopSet);
        skipPauses();
        if (peek()?.type === 'SUB_END') pos++;
        if (sub == null) return null;
        base = `${base}_{${sub}}`;
        continue;
      }
      if (next.type === 'SQUARED') {
        pos++;
        base = `${base}^2`;
        continue;
      }
      if (next.type === 'CUBED') {
        pos++;
        base = `${base}^3`;
        continue;
      }
      if (next.type === 'POW_START') {
        pos++;
        const hasEnd = hasFutureToken('POW_END');
        const exp = hasEnd
          ? parseExpr(new Set([...stopSet, 'POW_END']))
          : parseSinglePrimary(stopSet);
        skipPauses();
        if (peek()?.type === 'POW_END') pos++;
        if (exp == null) return null;
        base = `${base}^{${exp}}`;
        continue;
      }
      if (next.type === 'PRIME') {
        pos++;
        base = `${base}'`;
        continue;
      }
      if (next.type === 'DEG') {
        pos++;
        base = `${base}^{\\circ}`;
        continue;
      }
      if (next.type === 'DEG_F') {
        pos++;
        base = `${base}^{\\circ}\\text{F}`;
        continue;
      }
      if (next.type === 'DEG_C') {
        pos++;
        base = `${base}^{\\circ}\\text{C}`;
        continue;
      }
      if (next.type === 'PCT') {
        pos++;
        base = `${base}\\%`;
        continue;
      }
      if (next.type === 'UNIT' && next.val != null) {
        pos++;
        base = `${base}\\text{ ${next.val}}`;
        continue;
      }
      if (next.type === 'OVER' && !stopSet.has('OVER')) {
        pos++;
        const den = parseSinglePrimary(stopSet);
        if (den == null) return null;
        base = `\\frac{${base}}{${den}}`;
        continue;
      }
      break;
    }

    return base;
  }

  function parseSinglePrimary(stopSet: Set<string>): string | null {
    skipPauses();
    const tk = peek();
    if (!tk) return null;
    if (tk.type === 'NEG_KW') {
      pos++;
      const p = parseSinglePrimary(stopSet);
      return p == null ? null : `-${p}`;
    }
    if (tk.type === 'ATOM' && tk.val != null) {
      pos++;
      let val = tk.val;
      const nxt = peek();
      if (nxt?.type === 'SUB_OP' || nxt?.type === 'SUB_START') {
        const subType = nxt.type;
        pos++;
        const sub = parseSinglePrimary(stopSet);
        if (subType === 'SUB_START' && peek()?.type === 'SUB_END') pos++;
        if (sub != null) val = `${val}_{${sub}}`;
      }
      if (peek()?.type === 'SQUARED') {
        pos++;
        val = `${val}^2`;
      } else if (peek()?.type === 'CUBED') {
        pos++;
        val = `${val}^3`;
      }
      return val;
    }
    return parseFactor(stopSet);
  }

  const out = parseStatementList(new Set());
  skipPauses();
  if (!out || pos !== tokens.length) return null;
  return out;
}

function parseSingleAlt(s: string): string | null {
  const pre = preprocessAlt(s);
  if (pre.startsWith('__RAW_TEX__')) {
    return pre.slice('__RAW_TEX__'.length);
  }
  const labelMatch = pre.match(/^((?:Equation|Inequality|Line)\s*\d+\s*:\s*)(.+)$/i);
  if (labelMatch) {
    const bodyTex = parseSingleAlt(labelMatch[2]);
    return bodyTex ? `\\text{${labelMatch[1].trim()}\\ } ${bodyTex}` : null;
  }
  const { tokens, wrapOrderedPair, wrapSetBraces } = tokenizeSingleExpr(pre);
  return parseTokensToLatex(tokens, wrapOrderedPair, wrapSetBraces);
}

/**
 * Parses a disclosed Math image `alt` string into a LaTeX expression.
 * Returns `null` when the string is not pure math/symbolic notation.
 */
export function spokenMathToLatex(altRaw?: string | null): string | null {
  if (!altRaw || !altRaw.trim()) return null;

  let s = decodeHtmlEntities(altRaw).replace(/\s+/g, ' ').trim();
  s = s.replace(
    /^(?:Each option|This answer choice) consists of two (?:equations|inequalities)\.\s*/i,
    ''
  );

  // Brace-delimited systems: "open brace, eq1, and, eq2"
  const braceMatch = s.match(/^(?:open|left)\s+brace,?\s+(.+)$/i);
  if (braceMatch) {
    const braceParts = braceMatch[1].split(/\s*,\s*and\s*,\s*|\s*,\s*and\s+/);
    if (braceParts.length >= 2) {
      const lines = braceParts.map(parseSingleAlt);
      if (lines.every((l): l is string => Boolean(l))) {
        return `\\begin{cases} ${lines.join(' \\\\ ')} \\end{cases}`;
      }
    }
  }

  // Labeled multi-line systems: "Equation 1: ... Equation 2: ..."
  const multiLabelParts = s.split(/\.\s*(?=(?:Equation|Inequality|Line)\s*\d+\s*:)/i);
  if (multiLabelParts.length >= 2) {
    const parsedLines = multiLabelParts.map(parseSingleAlt);
    if (parsedLines.every((l): l is string => Boolean(l))) {
      return `\\begin{array}{l} ${parsedLines.join(' \\\\ ')} \\end{array}`;
    }
  }

  // Unlabeled multi-line systems separated by ", and, " or ";"
  const splitParts = s.split(/\s*,\s*and\s*,\s*|\s*;\s*/);
  if (splitParts.length >= 2) {
    const parsedLines = splitParts.map(parseSingleAlt);
    if (parsedLines.every((l): l is string => Boolean(l))) {
      return `\\begin{array}{l} ${parsedLines.join(' \\\\ ')} \\end{array}`;
    }
  }

  // Two relation clauses joined by "and"
  const andParts = s.split(/\s*,?\s+\band\b\s+/i);
  if (
    andParts.length === 2 &&
    /\b(equals|less than|greater than|=|<|>)\b/i.test(andParts[0]) &&
    /\b(equals|less than|greater than|=|<|>)\b/i.test(andParts[1])
  ) {
    const l1 = parseSingleAlt(andParts[0]);
    const l2 = parseSingleAlt(andParts[1]);
    if (l1 && l2) {
      return `\\begin{array}{l} ${l1} \\\\ ${l2} \\end{array}`;
    }
  }

  return parseSingleAlt(s);
}
