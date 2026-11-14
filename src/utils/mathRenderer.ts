import katex from 'katex';

const OPERATOR_MAP: Record<string, string> = {
  '−': '-',
  '–': '-',
  '×': '\\times ',
  '÷': '\\div ',
  '⋅': '\\cdot ',
  '·': '\\cdot ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\ne ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '∞': '\\infty ',
  '≈': '\\approx ',
  '≅': '\\cong ',
  '∼': '\\sim ',
  '∝': '\\propto ',
  '°': '^\\circ ',
  'π': '\\pi ',
  'θ': '\\theta ',
  'α': '\\alpha ',
  'β': '\\beta ',
  'γ': '\\gamma ',
  'Δ': '\\Delta ',
  'λ': '\\lambda ',
  'μ': '\\mu ',
  'σ': '\\sigma ',
  'ω': '\\omega ',
  '∠': '\\angle ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '△': '\\triangle ',
  '→': '\\rightarrow ',
  '←': '\\leftarrow ',
  '↔': '\\leftrightarrow ',
  '$': '\\text{\\$}',
  '%': '\\%',
  '&': '\\text{\\&}',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
};

function escapeTextForLatex(text: string): string {
  let out = text;
  for (const [char, replacement] of Object.entries(OPERATOR_MAP)) {
    out = out.split(char).join(replacement);
  }
  return out;
}

function mathmlNodeToLatex(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escapeTextForLatex((node.textContent || '').trim());
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as Element;
  const tag = el.tagName.toLowerCase().replace(/^m:/, '');
  const children = Array.from(el.childNodes);
  const childLatex = () => children.map(mathmlNodeToLatex).join('');

  switch (tag) {
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'mphantom':
      return childLatex();

    case 'mi': {
      const txt = (el.textContent || '').trim();
      if (!txt) return '';
      if (OPERATOR_MAP[txt]) return OPERATOR_MAP[txt];
      if (txt.length > 1) {
        if (['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'log', 'ln', 'lim', 'max', 'min'].includes(txt)) {
          return `\\${txt} `;
        }
        return `\\text{${escapeTextForLatex(txt)}}`;
      }
      return escapeTextForLatex(txt);
    }

    case 'mn': {
      const txt = (el.textContent || '').trim();
      return escapeTextForLatex(txt);
    }

    case 'mo': {
      const txt = (el.textContent || '').trim();
      if (!txt) return '';
      if (OPERATOR_MAP[txt]) return OPERATOR_MAP[txt];
      if (txt === '(' || txt === ')' || txt === '[' || txt === ']' || txt === '+' || txt === '-' || txt === '=' || txt === '<' || txt === '>' || txt === ',' || txt === ':' || txt === ';' || txt === '!' || txt === '|' || txt === '/') {
        return txt;
      }
      return escapeTextForLatex(txt);
    }

    case 'mtext': {
      const txt = el.textContent || '';
      if (!txt.trim()) return '\\; ';
      return `\\text{${escapeTextForLatex(txt)}}`;
    }

    case 'mspace':
      return '\\; ';

    case 'mfrac': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const num = mathmlNodeToLatex(elemChildren[0]);
        const den = mathmlNodeToLatex(elemChildren[1]);
        return `\\frac{${num}}{${den}}`;
      }
      return childLatex();
    }

    case 'msqrt':
      return `\\sqrt{${childLatex()}}`;

    case 'mroot': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const index = mathmlNodeToLatex(elemChildren[1]);
        return `\\sqrt[${index}]{${base}}`;
      }
      return `\\sqrt{${childLatex()}}`;
    }

    case 'msup': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const sup = mathmlNodeToLatex(elemChildren[1]);
        return `{${base}}^{${sup}}`;
      }
      return childLatex();
    }

    case 'msub': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const sub = mathmlNodeToLatex(elemChildren[1]);
        return `{${base}}_{${sub}}`;
      }
      return childLatex();
    }

    case 'msubsup': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 3) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const sub = mathmlNodeToLatex(elemChildren[1]);
        const sup = mathmlNodeToLatex(elemChildren[2]);
        return `{${base}}_{${sub}}^{${sup}}`;
      }
      return childLatex();
    }

    case 'mover': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const overTxt = (elemChildren[1].textContent || '').trim();
        if (overTxt === '¯' || overTxt === '‾' || overTxt === '_') {
          return `\\overline{${base}}`;
        }
        if (overTxt === '→' || overTxt === '⟶') {
          return `\\overrightarrow{${base}}`;
        }
        if (overTxt === '^' || overTxt === 'ˆ') {
          return `\\widehat{${base}}`;
        }
        const over = mathmlNodeToLatex(elemChildren[1]);
        return `\\overset{${over}}{${base}}`;
      }
      return childLatex();
    }

    case 'munder': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 2) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const under = mathmlNodeToLatex(elemChildren[1]);
        return `\\underset{${under}}{${base}}`;
      }
      return childLatex();
    }

    case 'mfenced': {
      const openAttr = el.getAttribute('open') ?? '(';
      const closeAttr = el.getAttribute('close') ?? ')';
      const sepAttr = el.getAttribute('separators') ?? ',';
      const elemChildren = Array.from(el.children);
      const inner = elemChildren
        .map(mathmlNodeToLatex)
        .join(sepAttr ? `${sepAttr} ` : ' ');
      const left = openAttr === '{' ? '\\{' : openAttr === '|' ? '|' : openAttr || '.';
      const right = closeAttr === '}' ? '\\}' : closeAttr === '|' ? '|' : closeAttr || '.';
      return `\\left${left}${inner}\\right${right}`;
    }

    case 'mtable': {
      const rows = Array.from(el.children)
        .map(mathmlNodeToLatex)
        .join(' \\\\ ');
      return `\\begin{matrix}${rows}\\end{matrix}`;
    }

    case 'mtr': {
      return Array.from(el.children)
        .map(mathmlNodeToLatex)
        .join(' & ');
    }

    case 'mtd':
      return childLatex();

    default:
      return childLatex();
  }
}

export function renderRichHtmlWithKatex(rawHtml?: string): string {
  if (!rawHtml) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return rawHtml;
  }

  let processed = rawHtml;

  // 1. Convert <math ...>...</math> blocks into KaTeX HTML
  if (processed.includes('<math')) {
    processed = processed.replace(/<math\b[^>]*>[\s\S]*?<\/math>/gi, (mathBlock) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(mathBlock, 'text/html');
        const mathEl = doc.querySelector('math');
        if (!mathEl) return mathBlock;

        const displayAttr = mathEl.getAttribute('display');
        const isDisplay = displayAttr === 'block';
        const latex = mathmlNodeToLatex(mathEl).trim();
        if (!latex) return mathBlock;

        return katex.renderToString(latex, {
          throwOnError: false,
          displayMode: isDisplay,
          strict: false,
          errorColor: 'inherit',
        });
      } catch {
        return mathBlock;
      }
    });
  }

  // 2. Convert explicit LaTeX \(...\) and \[...\] if present
  if (processed.includes('\\(') || processed.includes('\\[')) {
    processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => {
      try {
        return katex.renderToString(tex, {
          throwOnError: false,
          displayMode: true,
          errorColor: 'inherit',
        });
      } catch {
        return _;
      }
    });
    processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => {
      try {
        return katex.renderToString(tex, {
          throwOnError: false,
          displayMode: false,
          errorColor: 'inherit',
        });
      } catch {
        return _;
      }
    });
  }

  // 3. Remove restrictive small width/height attributes from standalone diagram images (keep inline .math-img untouched)
  if (processed.includes('<img')) {
    processed = processed.replace(/<img\b[^>]*>/gi, (imgTag) => {
      if (/class=["'][^"']*math-img/i.test(imgTag) || /role=["']math["']/i.test(imgTag)) {
        return imgTag;
      }
      return imgTag
        .replace(/\s+width=["'][^"']*["']/gi, '')
        .replace(/\s+height=["'][^"']*["']/gi, '');
    });
  }

  return processed;
}
