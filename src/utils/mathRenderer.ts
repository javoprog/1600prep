import katex from 'katex';

const OPERATOR_MAP: Record<string, string> = {
  '−': '-',
  '–': '-',
  '—': '\\text{---}',
  '×': '\\times ',
  '÷': '\\div ',
  '⋅': '\\cdot ',
  '·': '\\cdot ',
  '≤': '\\le ',
  '≥': '\\ge ',
  '≠': '\\ne ',
  '≡': '\\equiv ',
  '±': '\\pm ',
  '∓': '\\mp ',
  '∞': '\\infty ',
  '≈': '\\approx ',
  '≅': '\\cong ',
  '∼': '\\sim ',
  '∝': '\\propto ',
  '°': '^\\circ ',
  '′': "'",
  '″': "''",
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
  '∡': '\\measuredangle ',
  '⊥': '\\perp ',
  '∥': '\\parallel ',
  '△': '\\triangle ',
  '□': '\\square ',
  '∘': '\\circ ',
  '•': '\\bullet ',
  '√': '\\surd ',
  '→': '\\rightarrow ',
  '←': '\\leftarrow ',
  '↔': '\\leftrightarrow ',
  '⇒': '\\Rightarrow ',
  '⇐': '\\Leftarrow ',
  '⇔': '\\Leftrightarrow ',
  '︵': '\\frown ',
  '⌒': '\\frown ',
  '⌢': '\\frown ',
  '$': '\\text{\\$}',
  '%': '\\%',
  '&': '\\text{\\&}',
  '#': '\\#',
  '_': '\\_',
  '{': '\\{',
  '}': '\\}',
};

function stripInvisibleMathChars(str: string): string {
  return str
    .replace(/[\u200B-\u200D\u2060-\u2064\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ');
}

function escapeTextForLatex(text: string): string {
  let out = stripInvisibleMathChars(text);
  for (const [char, replacement] of Object.entries(OPERATOR_MAP)) {
    out = out.split(char).join(replacement);
  }
  return out;
}

function mapFenceDelimiter(delim: string): string {
  const trimmed = stripInvisibleMathChars(delim).trim();
  if (!trimmed) return '.';
  if (trimmed === '{') return '\\{';
  if (trimmed === '}') return '\\}';
  if (trimmed === '|' || trimmed === '∣') return '|';
  if (trimmed === '‖' || trimmed === '||') return '\\Vert ';
  if (trimmed === '⌊') return '\\lfloor ';
  if (trimmed === '⌋') return '\\rfloor ';
  if (trimmed === '⌈') return '\\lceil ';
  if (trimmed === '⌉') return '\\rceil ';
  if (trimmed === '⟨' || trimmed === '〈') return '\\langle ';
  if (trimmed === '⟩' || trimmed === '〉') return '\\rangle ';
  return trimmed;
}

function convertChildrenWithRadicalCheck(children: Node[]): string {
  const parts: string[] = [];
  let i = 0;
  while (i < children.length) {
    const node = children[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const tag = el.tagName.toLowerCase().replace(/^m:/, '');
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      if ((tag === 'mo' || tag === 'mi') && txt === '√') {
        // Look ahead for the next element sibling to wrap in \sqrt{...}
        let nextIdx = i + 1;
        while (
          nextIdx < children.length &&
          children[nextIdx].nodeType === Node.TEXT_NODE &&
          !(children[nextIdx].textContent || '').trim()
        ) {
          nextIdx++;
        }
        if (nextIdx < children.length) {
          const radContent = mathmlNodeToLatex(children[nextIdx]);
          parts.push(`\\sqrt{${radContent}}`);
          i = nextIdx + 1;
          continue;
        }
      }
    }
    parts.push(mathmlNodeToLatex(node));
    i++;
  }
  return parts.join('');
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
  const childLatex = () => convertChildrenWithRadicalCheck(children);

  switch (tag) {
    case 'math':
    case 'mrow':
    case 'mstyle':
    case 'mpadded':
    case 'mphantom':
      return childLatex();

    case 'semantics': {
      const texAnnotation = el.querySelector(
        'annotation[encoding*="tex"], annotation[encoding*="TeX"], annotation[encoding*="LaTeX"]'
      );
      if (texAnnotation && texAnnotation.textContent?.trim()) {
        return texAnnotation.textContent.trim();
      }
      const firstElem = el.firstElementChild;
      return firstElem ? mathmlNodeToLatex(firstElem) : childLatex();
    }

    case 'annotation':
    case 'annotation-xml':
      return '';

    case 'mi': {
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      if (!txt) return '';
      if (OPERATOR_MAP[txt]) return OPERATOR_MAP[txt];
      if (txt.length > 1) {
        if (
          [
            'sin',
            'cos',
            'tan',
            'sec',
            'csc',
            'cot',
            'arcsin',
            'arccos',
            'arctan',
            'log',
            'ln',
            'lim',
            'max',
            'min',
          ].includes(txt)
        ) {
          return `\\${txt} `;
        }
        return `\\text{${escapeTextForLatex(txt)}}`;
      }
      return escapeTextForLatex(txt);
    }

    case 'mn': {
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      return escapeTextForLatex(txt);
    }

    case 'mo': {
      const txt = stripInvisibleMathChars(el.textContent || '').trim();
      if (!txt) return '';
      if (OPERATOR_MAP[txt]) return OPERATOR_MAP[txt];
      if (
        txt === '(' ||
        txt === ')' ||
        txt === '[' ||
        txt === ']' ||
        txt === '+' ||
        txt === '-' ||
        txt === '=' ||
        txt === '<' ||
        txt === '>' ||
        txt === ',' ||
        txt === ':' ||
        txt === ';' ||
        txt === '!' ||
        txt === '|' ||
        txt === '/'
      ) {
        return txt;
      }
      return escapeTextForLatex(txt);
    }

    case 'mtext': {
      const txt = stripInvisibleMathChars(el.textContent || '');
      if (!txt.trim()) return '\\; ';
      return `\\text{${escapeTextForLatex(txt)}}`;
    }

    case 'mspace':
      return `\\; ${childLatex()}`;

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

    case 'menclose': {
      const notation = (el.getAttribute('notation') || 'longdiv').toLowerCase();
      const inner = childLatex();
      if (notation.includes('radical')) {
        return `\\sqrt{${inner}}`;
      }
      if (notation.includes('top') || notation.includes('actuarial')) {
        return `\\overline{${inner}}`;
      }
      if (notation.includes('bottom')) {
        return `\\underline{${inner}}`;
      }
      if (
        notation.includes('box') ||
        notation.includes('roundedbox') ||
        notation.includes('circle')
      ) {
        return `\\boxed{${inner}}`;
      }
      if (notation.includes('strike')) {
        return `\\cancel{${inner}}`;
      }
      return inner;
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
        const overTxt = stripInvisibleMathChars(
          elemChildren[1].textContent || ''
        ).trim();
        if (
          overTxt === '¯' ||
          overTxt === '‾' ||
          overTxt === '_' ||
          overTxt === '−' ||
          overTxt === '–' ||
          overTxt === '—' ||
          overTxt === '―' ||
          overTxt === '\u0304' ||
          overTxt === '\u0305'
        ) {
          return `\\overline{${base}}`;
        }
        if (overTxt === '→' || overTxt === '⟶' || overTxt === '⇀') {
          return `\\overrightarrow{${base}}`;
        }
        if (overTxt === '↔' || overTxt === '⟷') {
          return `\\overleftrightarrow{${base}}`;
        }
        if (overTxt === '^' || overTxt === 'ˆ' || overTxt === '∧') {
          return `\\widehat{${base}}`;
        }
        if (overTxt === '~' || overTxt === '∼' || overTxt === '˜') {
          return `\\widetilde{${base}}`;
        }
        if (overTxt === '︵' || overTxt === '⌒' || overTxt === '⌢') {
          return `\\overset{\\frown}{${base}}`;
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

    case 'munderover': {
      const elemChildren = Array.from(el.children);
      if (elemChildren.length >= 3) {
        const base = mathmlNodeToLatex(elemChildren[0]);
        const under = mathmlNodeToLatex(elemChildren[1]);
        const over = mathmlNodeToLatex(elemChildren[2]);
        return `{${base}}_{${under}}^{${over}}`;
      }
      return childLatex();
    }

    case 'mfenced': {
      const openAttr = el.getAttribute('open') ?? '(';
      const closeAttr = el.getAttribute('close') ?? ')';
      const sepAttrRaw = el.getAttribute('separators');
      const seps =
        sepAttrRaw === null
          ? [',']
          : sepAttrRaw.replace(/\s+/g, '').split('');
      const elemChildren = Array.from(el.children);
      const renderedChildren = elemChildren.map(mathmlNodeToLatex);

      let inner = '';
      for (let idx = 0; idx < renderedChildren.length; idx++) {
        if (idx > 0 && seps.length > 0) {
          const sepChar = seps[Math.min(idx - 1, seps.length - 1)];
          inner += `${escapeTextForLatex(sepChar)} `;
        } else if (idx > 0) {
          inner += ' ';
        }
        inner += renderedChildren[idx];
      }

      const left = mapFenceDelimiter(openAttr);
      const right = mapFenceDelimiter(closeAttr);
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

let svgInstanceCounter = 0;

function namespaceSvgIds(svgEl: SVGElement): void {
  const prefix = `sat_svg_${++svgInstanceCounter}_`;
  const idMap = new Map<string, string>();

  const elementsWithId = svgEl.querySelectorAll('[id]');
  elementsWithId.forEach((el) => {
    const oldId = el.getAttribute('id');
    if (oldId) {
      const newId = `${prefix}${oldId}`;
      idMap.set(oldId, newId);
      el.setAttribute('id', newId);
    }
  });

  if (idMap.size === 0) return;

  const allNodes = svgEl.querySelectorAll('*');
  allNodes.forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const val = attr.value;
      if (!val) continue;

      if (
        (attr.name === 'href' ||
          attr.name === 'xlink:href' ||
          attr.localName === 'href') &&
        val.startsWith('#')
      ) {
        const refId = val.slice(1);
        const mapped = idMap.get(refId);
        if (mapped) {
          el.setAttribute(attr.name, `#${mapped}`);
        }
      } else if (val.includes('url(#')) {
        const replaced = val.replace(/url\(#([^)]+)\)/g, (full, refId) => {
          const mapped = idMap.get(refId);
          return mapped ? `url(#${mapped})` : full;
        });
        if (replaced !== val) {
          el.setAttribute(attr.name, replaced);
        }
      }
    }
  });
}

export function renderRichHtmlWithKatex(rawHtml?: string): string {
  if (!rawHtml) return '';
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return rawHtml;
  }

  // Expand any self-closing MathML tags before HTML5 DOMParser runs
  let preProcessed = rawHtml.replace(
    /<(mspace|none|mprescripts|mi|mn|mo|mtext|ms)\b([^>]*?)\/>/gi,
    '<$1$2></$1>'
  );

  // Convert explicit LaTeX \[...\] and \(...\) if present
  if (preProcessed.includes('\\(') || preProcessed.includes('\\[')) {
    preProcessed = preProcessed.replace(/\\\[([\s\S]*?)\\\]/g, (match, tex) => {
      try {
        return katex.renderToString(tex, {
          throwOnError: false,
          displayMode: true,
          strict: false,
          trust: true,
          errorColor: 'inherit',
        });
      } catch {
        return match;
      }
    });
    preProcessed = preProcessed.replace(/\\\(([\s\S]*?)\\\)/g, (match, tex) => {
      try {
        return katex.renderToString(tex, {
          throwOnError: false,
          displayMode: false,
          strict: false,
          trust: true,
          errorColor: 'inherit',
        });
      } catch {
        return match;
      }
    });
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(preProcessed, 'text/html');

    // 1. Convert all <math> elements in the DOM into KaTeX HTML
    const mathNodes = Array.from(doc.querySelectorAll('math'));
    for (const mathEl of mathNodes) {
      const displayAttr = mathEl.getAttribute('display');
      const isDisplay = displayAttr === 'block';
      const latex = mathmlNodeToLatex(mathEl).trim();
      if (!latex) continue;

      const rendered = katex.renderToString(latex, {
        throwOnError: false,
        displayMode: isDisplay,
        strict: false,
        trust: true,
        errorColor: 'inherit',
      });

      const wrapper = doc.createElement('span');
      wrapper.innerHTML = rendered;
      mathEl.replaceWith(...Array.from(wrapper.childNodes));
    }

    // 2. Normalize standalone diagram <svg> elements (excluding KaTeX internal SVGs)
    const svgNodes = Array.from(doc.querySelectorAll('svg'));
    for (const svgEl of svgNodes) {
      if (svgEl.closest('.katex')) continue;

      svgEl.classList.add('sat-diagram-svg');
      namespaceSvgIds(svgEl);

      const widthAttr = svgEl.getAttribute('width') || '';
      const heightAttr = svgEl.getAttribute('height') || '';
      const numW = parseFloat(widthAttr);
      const numH = parseFloat(heightAttr);

      let viewBox = svgEl.getAttribute('viewBox');
      if (!viewBox && Number.isFinite(numW) && Number.isFinite(numH) && numW > 0 && numH > 0) {
        viewBox = `0 0 ${numW} ${numH}`;
        svgEl.setAttribute('viewBox', viewBox);
      }

      if (viewBox) {
        const parts = viewBox
          .trim()
          .split(/[\s,]+/)
          .map(Number);
        if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
          const vbW = parts[2];
          const vbH = parts[3];
          const maxDim = Math.max(vbW, vbH);
          // Scale up small SAT diagrams so axes, labels, and points are crisp and easy to read
          const scale = Math.max(1.25, Math.min(2.1, 360 / maxDim));
          const targetWidthPx = Math.round(vbW * scale);
          svgEl.removeAttribute('width');
          svgEl.removeAttribute('height');
          svgEl.style.width = `${targetWidthPx}px`;
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
        }
      }
    }

    // 3. Classify <img> elements into inline math PNGs vs standalone diagram figures
    const imgNodes = Array.from(doc.querySelectorAll('img'));
    for (const imgEl of imgNodes) {
      const isInlineMath =
        imgEl.classList.contains('math-img') ||
        imgEl.getAttribute('role') === 'math' ||
        imgEl.getAttribute('align') === 'middle' ||
        Boolean(imgEl.closest('.math-container, .math'));

      if (isInlineMath) {
        imgEl.classList.add('math-img');
      } else {
        imgEl.classList.add('sat-diagram-img');
        imgEl.removeAttribute('width');
        imgEl.removeAttribute('height');
      }
    }

    return doc.body.innerHTML;
  } catch {
    return preProcessed;
  }
}
